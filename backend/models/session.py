from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class SessionPhase(str, Enum):
    INTAKE = "intake"
    SEARCH = "search"
    MATCHING = "matching"
    SELECTION = "selection"
    REPORT = "report"
    FOLLOWUP = "followup"


class ChatMessage(BaseModel):
    role: str  # "user", "assistant", "system"
    content: str
    message_type: str = "text"  # "text", "widget", "trial_cards", "status", "map_data", "report_ready"
    metadata: dict = Field(default_factory=dict)


class SessionState(BaseModel):
    session_id: str
    phase: SessionPhase = SessionPhase.INTAKE
    messages: list[ChatMessage] = Field(default_factory=list)
    profile_complete: bool = False
    search_complete: bool = False
    matching_complete: bool = False
    selected_trial_ids: list[str] = Field(default_factory=list)
    report_generated: bool = False
