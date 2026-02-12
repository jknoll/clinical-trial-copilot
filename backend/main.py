from __future__ import annotations

import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.models.patient import HealthKitImport
from backend.session import SessionManager

logger = logging.getLogger(__name__)

app = FastAPI(title="Clinical Trial Navigator", version="0.1.0")

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
]
if os.environ.get("FRONTEND_URL"):
    origins.append(os.environ["FRONTEND_URL"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_mgr = SessionManager()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "clinical-trial-navigator"}


@app.post("/api/sessions")
async def create_session():
    session_id = session_mgr.create_session()
    return {"session_id": session_id}


@app.get("/api/sessions/{session_id}/profile")
async def get_profile(session_id: str):
    profile = session_mgr.get_profile(session_id)
    return profile.model_dump()


@app.get("/api/sessions/{session_id}/state")
async def get_state(session_id: str):
    state = session_mgr.get_state(session_id)
    return state.model_dump()


@app.get("/api/sessions/{session_id}/trials")
async def get_trials(session_id: str):
    trials = session_mgr.get_search_results(session_id)
    return [t.model_dump() for t in trials]


@app.get("/api/sessions/{session_id}/matched")
async def get_matched(session_id: str):
    matched = session_mgr.get_matched_trials(session_id)
    return [t.model_dump() for t in matched]


@app.get("/api/sessions/{session_id}/report")
async def get_report(session_id: str):
    html = session_mgr.get_report(session_id)
    if html is None:
        return JSONResponse({"error": "Report not yet generated"}, status_code=404)
    return HTMLResponse(html)


@app.get("/api/sessions/{session_id}/report.pdf")
async def get_report_pdf(session_id: str):
    html = session_mgr.get_report(session_id)
    if html is None:
        return JSONResponse({"error": "Report not yet generated"}, status_code=404)

    from backend.report.pdf_generator import PDFGenerationError, generate_pdf

    try:
        pdf_bytes = await generate_pdf(html)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=trial-report-{session_id[:8]}.pdf"},
        )
    except PDFGenerationError as exc:
        logger.warning("PDF generation failed, returning HTML fallback: %s", exc)
        banner = (
            '<div style="background:#fff3cd;color:#856404;padding:12px 16px;'
            "border:1px solid #ffc107;border-radius:4px;margin-bottom:16px;"
            'font-family:sans-serif;font-size:14px;">'
            "<strong>PDF generation unavailable</strong> &mdash; showing HTML version. "
            "To enable PDF export, run <code>playwright install chromium</code> on the server."
            "</div>"
        )
        # Inject the banner right after <body> if present, otherwise prepend.
        if "<body" in html.lower():
            import re

            fallback_html = re.sub(
                r"(<body[^>]*>)",
                rf"\1{banner}",
                html,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            fallback_html = banner + html
        return HTMLResponse(content=fallback_html)


# ---------------------------------------------------------------------------
# Apple Health Import endpoints
# ---------------------------------------------------------------------------

def _build_import_summary(hk: HealthKitImport, ecog: int | None) -> dict:
    """Return a JSON-serialisable summary dict for a HealthKitImport."""
    return {
        "status": "ok",
        "lab_count": len(hk.lab_results),
        "vital_count": len(hk.vitals),
        "medication_count": len(hk.medications),
        "activity_steps_per_day": hk.activity_steps_per_day,
        "activity_active_minutes_per_day": hk.activity_active_minutes_per_day,
        "estimated_ecog": ecog,
        "import_date": hk.import_date,
        "source_file": hk.source_file,
    }


def _merge_health_kit(session_id: str, hk: HealthKitImport) -> dict:
    """Merge a HealthKitImport into the session profile and return a summary."""
    from backend.mcp_servers.apple_health import estimate_ecog_from_steps

    profile = session_mgr.get_profile(session_id)
    profile.health_kit = hk

    # Auto-populate ECOG from step data if available
    ecog_estimate: int | None = None
    if hk.activity_steps_per_day is not None:
        ecog_estimate = estimate_ecog_from_steps(hk.activity_steps_per_day)
        profile.demographics.estimated_ecog = ecog_estimate

    session_mgr.save_profile(session_id, profile)
    return _build_import_summary(hk, ecog_estimate)


@app.post("/api/sessions/{session_id}/health-import")
async def health_import(
    session_id: str,
    use_dummy: bool = False,
    file: UploadFile | None = File(default=None),
):
    """Import Apple Health data from a ZIP file upload or the built-in dummy export."""
    import zipfile

    from backend.mcp_servers.apple_health import parse_apple_health_xml

    # Validate session exists (raises ValueError if not)
    session_mgr.session_dir(session_id)

    if use_dummy:
        # Use the bundled dummy HealthKit export
        dummy_path = Path(__file__).parent / "static" / "dummy_healthkit_export.zip"
        if not dummy_path.exists():
            return JSONResponse(
                {"error": "Dummy HealthKit export not found at backend/static/dummy_healthkit_export.zip"},
                status_code=404,
            )
        with zipfile.ZipFile(dummy_path, "r") as zf:
            # Look for export.xml inside the ZIP
            xml_names = [n for n in zf.namelist() if n.endswith(".xml")]
            if not xml_names:
                return JSONResponse({"error": "No XML file found in dummy ZIP"}, status_code=400)
            with zf.open(xml_names[0]) as xml_stream:
                hk = parse_apple_health_xml(xml_stream, zip_file=zf)
        hk.source_file = "dummy_healthkit_export.zip"
        if not hk.import_date:
            hk.import_date = datetime.now(timezone.utc).isoformat()

        summary = _merge_health_kit(session_id, hk)
        return summary

    # File upload path
    if file is None:
        return JSONResponse(
            {"error": "Provide a file upload or set ?use_dummy=true"},
            status_code=400,
        )

    # Save upload to a temp file so the ZIP can be opened by path
    suffix = Path(file.filename or "upload.zip").suffix or ".zip"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        contents = await file.read()
        tmp.write(contents)

    try:
        with zipfile.ZipFile(tmp_path, "r") as zf:
            xml_names = [n for n in zf.namelist() if n.endswith(".xml")]
            if not xml_names:
                return JSONResponse({"error": "No XML file found in uploaded ZIP"}, status_code=400)
            with zf.open(xml_names[0]) as xml_stream:
                hk = parse_apple_health_xml(xml_stream, zip_file=zf)
        hk.source_file = file.filename or "upload.zip"
        if not hk.import_date:
            hk.import_date = datetime.now(timezone.utc).isoformat()

        summary = _merge_health_kit(session_id, hk)
        return summary
    finally:
        tmp_path.unlink(missing_ok=True)


@app.post("/api/sessions/{session_id}/health-import-json")
async def health_import_json(session_id: str, hk: HealthKitImport):
    """Import Apple Health data from a JSON payload matching the HealthKitImport schema."""
    # Validate session exists (raises ValueError if not)
    session_mgr.session_dir(session_id)

    if not hk.import_date:
        hk.import_date = datetime.now(timezone.utc).isoformat()

    summary = _merge_health_kit(session_id, hk)
    return summary


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
_static_dir = Path(__file__).parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# Stats API (direct REST, not through Claude)
from backend.api.stats import router as stats_router  # noqa: E402

app.include_router(stats_router)


@app.on_event("startup")
async def startup_aact_pool():
    if settings.aact_database_url:
        try:
            from backend.mcp_servers.aact_queries import get_pool

            await get_pool()
            logger.info("AACT database pool initialized")
        except Exception as e:
            logger.warning(f"AACT database connection failed (stats panel will be unavailable): {e}")
    else:
        logger.warning("AACT_DATABASE_URL not set — stats panel will be unavailable")


@app.on_event("startup")
async def startup_check_playwright():
    """Check if Playwright browsers are installed and log a warning if not."""
    from backend.report.pdf_generator import check_playwright_browsers

    check_playwright_browsers()


@app.on_event("shutdown")
async def shutdown_aact_pool():
    from backend.mcp_servers.aact_queries import close_pool

    await close_pool()


# WebSocket endpoint is registered in websocket.py
from backend.websocket import router as ws_router  # noqa: E402

app.include_router(ws_router)
