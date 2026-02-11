"""Tests for intake answer accumulation and profile accuracy fix.

These tests verify that patient answers collected during intake survive
conversation history trimming and appear correctly in the session context.
No Claude API calls are needed — we test the orchestrator's internal methods directly.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from backend.agents.orchestrator import AgentOrchestrator
from backend.models.session import SessionPhase, SessionState


def _make_orchestrator() -> AgentOrchestrator:
    """Create an orchestrator with a mocked session manager."""
    mgr = MagicMock()
    mgr.get_state.return_value = SessionState(
        session_id="test-session",
        phase=SessionPhase.INTAKE,
        profile_complete=False,
    )
    return AgentOrchestrator("test-session", mgr)


# ---------------------------------------------------------------------------
# TestExtractIntakeAnswer
# ---------------------------------------------------------------------------


class TestExtractIntakeAnswer:
    """Verify _extract_intake_answer parses widget responses correctly."""

    def test_parses_widget_response_em_dash(self):
        orch = _make_orchestrator()
        orch._extract_intake_answer('Question: "What is your sex?" — My answer: Male')
        assert orch._intake_answers["What is your sex?"] == "Male"

    def test_parses_widget_response_double_hyphen(self):
        orch = _make_orchestrator()
        orch._extract_intake_answer('Question: "What is your age?" -- My answer: 45')
        assert orch._intake_answers["What is your age?"] == "45"

    def test_accumulates_multiple_answers(self):
        orch = _make_orchestrator()
        orch._extract_intake_answer('Question: "Sex?" — My answer: Male')
        orch._extract_intake_answer('Question: "Location?" — My answer: San Francisco')
        orch._extract_intake_answer('Question: "Age?" — My answer: 45')
        assert len(orch._intake_answers) == 3
        assert orch._intake_answers["Sex?"] == "Male"
        assert orch._intake_answers["Location?"] == "San Francisco"
        assert orch._intake_answers["Age?"] == "45"

    def test_handles_free_text(self):
        orch = _make_orchestrator()
        orch._extract_intake_answer("I have stage 3 non-small cell lung cancer")
        assert "free_text_1" in orch._intake_answers
        assert orch._intake_answers["free_text_1"] == "I have stage 3 non-small cell lung cancer"

    def test_free_text_counter_increments(self):
        orch = _make_orchestrator()
        orch._extract_intake_answer("First message")
        orch._extract_intake_answer("Second message")
        assert orch._intake_answers["free_text_1"] == "First message"
        assert orch._intake_answers["free_text_2"] == "Second message"

    def test_overwrites_same_question(self):
        orch = _make_orchestrator()
        orch._extract_intake_answer('Question: "Age?" — My answer: 44')
        orch._extract_intake_answer('Question: "Age?" — My answer: 45')
        assert orch._intake_answers["Age?"] == "45"

    def test_multi_select_comma_separated(self):
        orch = _make_orchestrator()
        msg = (
            'Question: "What treatments have you tried?"'
            " — My answer: Chemotherapy, Radiation, Surgery"
        )
        orch._extract_intake_answer(msg)
        expected = "Chemotherapy, Radiation, Surgery"
        assert orch._intake_answers["What treatments have you tried?"] == expected


# ---------------------------------------------------------------------------
# TestBuildSessionContextWithAnswers
# ---------------------------------------------------------------------------


class TestBuildSessionContextWithAnswers:
    """Verify _build_session_context includes collected answers during intake."""

    def test_answers_appear_in_context_during_intake(self):
        orch = _make_orchestrator()
        orch._intake_answers = {
            "What is your sex?": "Male",
            "Where are you located?": "San Francisco",
            "How old are you?": "45",
        }
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )
        context = orch._build_session_context(state)
        assert "Collected Patient Answers" in context
        assert "What is your sex?: Male" in context
        assert "Where are you located?: San Francisco" in context
        assert "How old are you?: 45" in context

    def test_free_text_appears_as_description(self):
        orch = _make_orchestrator()
        orch._intake_answers = {"free_text_1": "Stage 3 NSCLC"}
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )
        context = orch._build_session_context(state)
        assert "Patient description: Stage 3 NSCLC" in context

    def test_answers_omitted_after_profile_complete(self):
        orch = _make_orchestrator()
        orch._intake_answers = {"What is your sex?": "Male"}
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=True,
        )
        # Mock get_profile to avoid file I/O
        orch.session_mgr.get_profile.side_effect = FileNotFoundError
        context = orch._build_session_context(state)
        assert "Collected Patient Answers" not in context

    def test_empty_answers_no_section(self):
        orch = _make_orchestrator()
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )
        context = orch._build_session_context(state)
        assert "Collected Patient Answers" not in context


# ---------------------------------------------------------------------------
# TestTrimHistoryIntake
# ---------------------------------------------------------------------------


class TestTrimHistoryIntake:
    """Verify _trim_history uses phase-aware thresholds."""

    def _fill_history(self, orch: AgentOrchestrator, count: int):
        """Add `count` dummy messages to conversation history."""
        for i in range(count):
            role = "user" if i % 2 == 0 else "assistant"
            orch.conversation_history.append({
                "role": role,
                "content": f"Message {i}",
            })

    def test_intake_30_messages_not_trimmed(self):
        """30 messages < 50 threshold during intake — should NOT be trimmed."""
        orch = _make_orchestrator()
        self._fill_history(orch, 30)
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )
        orch._trim_history(state)
        assert len(orch.conversation_history) == 30

    def test_intake_55_messages_trimmed(self):
        """55 messages > 50 threshold during intake — SHOULD be trimmed."""
        orch = _make_orchestrator()
        self._fill_history(orch, 55)
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )
        orch._trim_history(state)
        # 2 (start) + 1 (marker) + 20 (end) = 23
        assert len(orch.conversation_history) == 23

    def test_search_phase_30_messages_trimmed(self):
        """30 messages > 24 threshold during SEARCH — SHOULD be trimmed."""
        orch = _make_orchestrator()
        self._fill_history(orch, 30)
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.SEARCH,
            profile_complete=True,
        )
        orch._trim_history(state)
        assert len(orch.conversation_history) == 23

    def test_search_phase_20_messages_not_trimmed(self):
        """20 messages < 24 threshold during SEARCH — should NOT be trimmed."""
        orch = _make_orchestrator()
        self._fill_history(orch, 20)
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.SEARCH,
            profile_complete=True,
        )
        orch._trim_history(state)
        assert len(orch.conversation_history) == 20

    def test_no_state_uses_default_threshold(self):
        """When state is None, uses default threshold of 24."""
        orch = _make_orchestrator()
        self._fill_history(orch, 30)
        orch._trim_history(None)
        assert len(orch.conversation_history) == 23


# ---------------------------------------------------------------------------
# TestFullIntakeFlow
# ---------------------------------------------------------------------------


class TestFullIntakeFlow:
    """Simulate a full intake flow and verify answers survive in system context."""

    def test_eight_qa_cycles_all_answers_in_context(self):
        """Simulate 8 Q&A cycles (each adds ~4 messages to history).

        Even if trimming occurs, all answers should be in the system prompt
        because they were extracted into _intake_answers.
        """
        orch = _make_orchestrator()
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )

        # Initial free-text message
        orch._extract_intake_answer("I have stage 3 non-small cell lung cancer")

        # Simulate 8 widget Q&A cycles
        questions = [
            ("What is your sex?", "Male"),
            ("How old are you?", "45"),
            ("Where are you located?", "San Francisco, CA"),
            ("What treatments have you tried?", "Chemotherapy, Immunotherapy"),
            ("What is your ECOG performance status?", "1 - Restricted but ambulatory"),
            ("How far are you willing to travel?", "100 miles"),
            ("Are you open to placebo-controlled trials?", "Yes"),
            ("What trial phases interest you?", "Phase 2, Phase 3"),
        ]

        for question, answer in questions:
            # Each Q&A cycle in reality generates ~4 messages:
            # user response, assistant tool_use, tool_result, assistant text
            orch._extract_intake_answer(f'Question: "{question}" — My answer: {answer}')
            user_msg = f'Question: "{question}" — My answer: {answer}'
            tool_use = {
                "type": "tool_use", "id": "t1",
                "name": "emit_widget", "input": {},
            }
            tool_result = {
                "type": "tool_result",
                "tool_use_id": "t1", "content": "ok",
            }
            orch.conversation_history.extend([
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": [tool_use]},
                {"role": "user", "content": [tool_result]},
                {"role": "assistant", "content": [{"type": "text", "text": "Got it."}]},
            ])

        # We should have 32+ messages — enough to trigger trimming even at 50
        # But the critical check is that answers are in the context
        assert len(orch._intake_answers) == 9  # 1 free text + 8 widget answers

        context = orch._build_session_context(state)

        # All widget answers should be in the context
        for question, answer in questions:
            assert answer in context, f"Missing answer for '{question}': {answer}"

        # Free text should also be there
        assert "stage 3 non-small cell lung cancer" in context

    def test_answers_survive_after_trimming(self):
        """Even after aggressive trimming, answers remain in the system prompt."""
        orch = _make_orchestrator()
        state = SessionState(
            session_id="test-session",
            phase=SessionPhase.INTAKE,
            profile_complete=False,
        )

        # Add many answers
        answers = {
            "Sex?": "Male",
            "Age?": "45",
            "Location?": "San Francisco",
        }
        for q, a in answers.items():
            orch._extract_intake_answer(f'Question: "{q}" — My answer: {a}')

        # Fill history well beyond even the intake threshold
        for i in range(60):
            role = "user" if i % 2 == 0 else "assistant"
            orch.conversation_history.append({"role": role, "content": f"msg {i}"})

        # Trim — this will cut messages
        orch._trim_history(state)
        assert len(orch.conversation_history) == 23  # trimmed

        # But answers are still in the context!
        context = orch._build_session_context(state)
        assert "Male" in context
        assert "45" in context
        assert "San Francisco" in context
