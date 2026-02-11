"""HTML report generator for clinical trial briefings."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from backend.models.patient import PatientProfile
from backend.models.trial import MatchedTrial

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"


def generate_report(
    profile: PatientProfile,
    matched_trials: list[MatchedTrial],
    doctor_questions: list[str] | None = None,
    glossary: list[dict[str, str]] | None = None,
    executive_summary: str | None = None,
) -> str:
    """Generate an accessible HTML report from matched trial data."""
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=True,
    )
    template = env.get_template("report.html")

    if executive_summary is None:
        n = len(matched_trials)
        condition = profile.condition.primary_diagnosis or "your condition"
        executive_summary = (
            f"Based on your profile, we found {n} clinical trial{'s' if n != 1 else ''} "
            f"that may be relevant for {condition}. "
            f"{'These are ranked by how well they match your profile.' if n > 0 else 'Consider broadening your search criteria or discussing other options with your doctor.'}"
        )

    if glossary is None:
        glossary = _default_glossary()

    if doctor_questions is None:
        doctor_questions = _default_questions(profile, matched_trials)

    html = template.render(
        profile=profile.model_dump(),
        matched_trials=[t.model_dump() for t in matched_trials],
        executive_summary=executive_summary,
        doctor_questions=doctor_questions,
        glossary=glossary,
        comparison_table=len(matched_trials) > 1,
        generated_date=datetime.now().strftime("%B %d, %Y"),
    )
    return html


def _default_glossary() -> list[dict[str, str]]:
    return [
        {"term": "Clinical Trial", "definition": "A research study that tests how well a new medical approach works in people."},
        {"term": "Phase 1", "definition": "First stage of testing in humans, primarily evaluating safety. Usually involves a small group (20-80 people)."},
        {"term": "Phase 2", "definition": "Testing in a larger group (100-300 people) to evaluate how well the treatment works and further assess safety."},
        {"term": "Phase 3", "definition": "Large-scale testing (1,000-3,000 people) comparing the new treatment to current standard treatment."},
        {"term": "Randomized", "definition": "Participants are assigned to treatment groups by chance (like flipping a coin), not by choice."},
        {"term": "Double-blind", "definition": "Neither the participants nor the doctors know which treatment group a participant is in, to prevent bias."},
        {"term": "Placebo", "definition": "An inactive treatment (like a sugar pill) used as a comparison to measure the real effects of the study treatment."},
        {"term": "Eligibility Criteria", "definition": "The requirements a person must meet to join a clinical trial, including medical and personal factors."},
        {"term": "Informed Consent", "definition": "The process of learning about a clinical trial before deciding whether to participate. You can withdraw at any time."},
        {"term": "NCT Number", "definition": "A unique identification number assigned to each clinical trial registered on ClinicalTrials.gov."},
    ]


def _default_questions(profile: PatientProfile, trials: list[MatchedTrial]) -> list[str]:
    questions = [
        "Based on my current condition and treatment history, am I a good candidate for any of these trials?",
        "Are there any eligibility criteria that might disqualify me that we should discuss?",
        "How would participating in a clinical trial affect my current treatment plan?",
        "What are the potential risks and benefits of each trial compared to my current treatment options?",
    ]
    if any(t.phase in ("Phase 1", "PHASE1", "Phase 1/Phase 2") for t in trials):
        questions.append(
            "Some of these trials are early-phase (Phase 1). What does that mean for the level of evidence about safety and effectiveness?"
        )
    if profile.location.max_travel_miles and profile.location.max_travel_miles > 100:
        questions.append(
            "For trials that require travel, how often would I need to visit the study site, and is there any support for travel costs?"
        )
    questions.extend([
        "If I enroll in a trial, what happens if the treatment isn't working or I experience side effects?",
        "Can you help me contact the study coordinators for the trials that seem like the best fit?",
    ])
    return questions
