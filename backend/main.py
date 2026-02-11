from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from backend.session import SessionManager

app = FastAPI(title="Clinical Trial Navigator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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


# WebSocket endpoint is registered in websocket.py
from backend.websocket import router as ws_router  # noqa: E402

app.include_router(ws_router)
