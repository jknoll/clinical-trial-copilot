"""WebSocket handler for real-time chat streaming."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.agents.orchestrator import AgentOrchestrator
from backend.session import SessionManager

logger = logging.getLogger(__name__)
router = APIRouter()

# Store active orchestrators per session
_orchestrators: dict[str, AgentOrchestrator] = {}

# Store active WebSocket connections per session for push notifications
_active_connections: dict[str, WebSocket] = {}


async def notify_session(session_id: str, message: dict) -> None:
    """Send a JSON message to the active WebSocket for *session_id* (if any)."""
    ws = _active_connections.get(session_id)
    if ws is None:
        return
    try:
        await ws.send_json(message)
    except Exception:
        logger.debug("Failed to push notification to session %s", session_id)


def _get_orchestrator(session_id: str, session_mgr: SessionManager) -> AgentOrchestrator:
    if session_id not in _orchestrators:
        _orchestrators[session_id] = AgentOrchestrator(session_id, session_mgr)
    return _orchestrators[session_id]


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session_mgr = SessionManager()

    # Validate session exists
    try:
        session_mgr.session_dir(session_id)
    except ValueError:
        await websocket.send_json({"type": "error", "content": "Invalid session ID"})
        await websocket.close()
        return

    orchestrator = _get_orchestrator(session_id, session_mgr)
    _active_connections[session_id] = websocket

    # Send welcome message only for new sessions (no conversation history)
    if not orchestrator.conversation_history:
        await websocket.send_json({
            "type": "text",
            "content": (
                "Welcome to the Clinical Trial Compass!\n\n"
                "What condition are you exploring clinical trials for? "
                "Please include the specific diagnosis, stage, or subtype if you know it."
            ),
        })
        await websocket.send_json({"type": "text_done"})

    try:
        while True:
            # Receive message from client
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = {"type": "message", "content": raw}

            msg_type = data.get("type", "message")

            if msg_type == "system_hint":
                # System hints from the frontend (e.g. zero-results warning)
                user_content = f"[System: {data.get('content', '')}]"
            elif msg_type == "message":
                user_content = data.get("content", "")
                # Store browser-detected location on the orchestrator so it persists
                # in the system prompt across the entire conversation
                location_ctx = data.get("location_context")
                if location_ctx:
                    orchestrator._detected_location = location_ctx
            elif msg_type == "widget_response":
                # Format widget response with the question context for the agent
                selections = data.get("selections", [])
                question_text = data.get("question", "")
                if question_text:
                    user_content = f"Question: \"{question_text}\" — My answer: {', '.join(selections)}"
                else:
                    user_content = f"My answer: {', '.join(selections)}"
            elif msg_type == "trial_selection":
                # User selected trials for deep analysis
                selected_ids = data.get("trialIds", [])
                state = session_mgr.get_state(session_id)
                state.selected_trial_ids = selected_ids
                session_mgr.save_state(session_id, state)
                user_content = f"I've selected these trials for detailed analysis: {', '.join(selected_ids)}"
            else:
                user_content = data.get("content", str(data))

            if not user_content.strip():
                continue

            # Process through orchestrator and stream responses
            async for chunk in orchestrator.process_message(user_content):
                await websocket.send_json(chunk)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
        # Keep orchestrator alive so session can be resumed
    except Exception:
        logger.exception("WebSocket error for session %s", session_id)
        try:
            await websocket.send_json({
                "type": "error",
                "content": "An unexpected error occurred. Please try again.",
            })
        except Exception:
            pass
        # Keep orchestrator alive so session can be resumed
    finally:
        _active_connections.pop(session_id, None)
