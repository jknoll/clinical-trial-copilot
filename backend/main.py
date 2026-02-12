from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response

from backend.config import settings
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
    from backend.report.pdf_generator import generate_pdf
    pdf_bytes = await generate_pdf(html)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=trial-report-{session_id[:8]}.pdf"},
    )


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


@app.on_event("shutdown")
async def shutdown_aact_pool():
    from backend.mcp_servers.aact_queries import close_pool

    await close_pool()


# WebSocket endpoint is registered in websocket.py
from backend.websocket import router as ws_router  # noqa: E402

app.include_router(ws_router)
