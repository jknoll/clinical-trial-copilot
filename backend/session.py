from __future__ import annotations

import json
import secrets
from pathlib import Path

from backend.config import settings
from backend.models.patient import PatientProfile
from backend.models.session import SessionState
from backend.models.trial import MatchedTrial, TrialSummary


_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class SessionManager:
    def __init__(self, base_dir: Path | None = None):
        self.base_dir = base_dir or settings.sessions_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _generate_short_id(self, length: int = 6) -> str:
        while True:
            sid = "".join(secrets.choice(_ALPHABET) for _ in range(length))
            if not (self.base_dir / sid).exists():
                return sid

    def create_session(self) -> str:
        session_id = self._generate_short_id()
        session_dir = self.base_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / "deep_dives").mkdir(exist_ok=True)

        state = SessionState(session_id=session_id)
        self._write_json(session_dir / "state.json", state.model_dump())

        profile = PatientProfile()
        self._write_json(session_dir / "patient_profile.json", profile.model_dump())

        return session_id

    def session_dir(self, session_id: str) -> Path:
        d = self.base_dir / session_id
        if not d.exists():
            raise ValueError(f"Session {session_id} not found")
        return d

    def get_state(self, session_id: str) -> SessionState:
        path = self.session_dir(session_id) / "state.json"
        data = json.loads(path.read_text())
        return SessionState(**data)

    def save_state(self, session_id: str, state: SessionState) -> None:
        path = self.session_dir(session_id) / "state.json"
        self._write_json(path, state.model_dump())

    def get_profile(self, session_id: str) -> PatientProfile:
        path = self.session_dir(session_id) / "patient_profile.json"
        data = json.loads(path.read_text())
        return PatientProfile(**data)

    def save_profile(self, session_id: str, profile: PatientProfile) -> None:
        path = self.session_dir(session_id) / "patient_profile.json"
        self._write_json(path, profile.model_dump())

    def get_search_results(self, session_id: str) -> list[TrialSummary]:
        path = self.session_dir(session_id) / "search_results.json"
        if not path.exists():
            return []
        data = json.loads(path.read_text())
        return [TrialSummary(**t) for t in data]

    def save_search_results(self, session_id: str, trials: list[TrialSummary]) -> None:
        path = self.session_dir(session_id) / "search_results.json"
        self._write_json(path, [t.model_dump() for t in trials])

    def get_matched_trials(self, session_id: str) -> list[MatchedTrial]:
        path = self.session_dir(session_id) / "matched_trials.json"
        if not path.exists():
            return []
        data = json.loads(path.read_text())
        return [MatchedTrial(**t) for t in data]

    def save_matched_trials(self, session_id: str, trials: list[MatchedTrial]) -> None:
        path = self.session_dir(session_id) / "matched_trials.json"
        self._write_json(path, [t.model_dump() for t in trials])

    def save_report(self, session_id: str, html: str) -> None:
        path = self.session_dir(session_id) / "report.html"
        path.write_text(html, encoding="utf-8")

    def get_report(self, session_id: str) -> str | None:
        path = self.session_dir(session_id) / "report.html"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def _write_json(self, path: Path, data: dict | list) -> None:
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
