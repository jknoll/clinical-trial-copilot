"""HTML report generator for clinical trial briefings."""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime
from pathlib import Path

import qrcode
from jinja2 import Environment, FileSystemLoader

from backend.models.patient import PatientProfile
from backend.models.trial import MatchedTrial

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"


def _generate_qr_data_uri(url: str, size: int = 4) -> str:
    """Generate a QR code as a base64 PNG data URI."""
    qr = qrcode.QRCode(version=1, box_size=size, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


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

    matched_trials_data = [t.model_dump() for t in matched_trials]
    for trial in matched_trials_data:
        trial["qr_data_uri"] = _generate_qr_data_uri(
            f"https://clinicaltrials.gov/study/{trial['nct_id']}"
        )

    html = template.render(
        profile=profile.model_dump(),
        matched_trials=matched_trials_data,
        executive_summary=executive_summary,
        doctor_questions=doctor_questions,
        glossary=glossary,
        comparison_table=len(matched_trials) > 1,
        generated_date=datetime.now().strftime("%B %d, %Y"),
    )
    return html


def _default_glossary() -> list[dict[str, str]]:
    return [
        {"term": "Clinical Trial", "definition": "A research study that tests how well a new medical approach works in people.", "url": "https://clinicaltrials.gov/about-studies/learn-about-studies"},
        {"term": "Phase 1", "definition": "First stage of testing in humans, primarily evaluating safety. Usually involves a small group (20-80 people).", "url": "https://www.cancer.gov/about-cancer/treatment/clinical-trials/what-are-trials/phases"},
        {"term": "Phase 2", "definition": "Testing in a larger group (100-300 people) to evaluate how well the treatment works and further assess safety.", "url": "https://www.cancer.gov/about-cancer/treatment/clinical-trials/what-are-trials/phases"},
        {"term": "Phase 3", "definition": "Large-scale testing (1,000-3,000 people) comparing the new treatment to current standard treatment.", "url": "https://www.cancer.gov/about-cancer/treatment/clinical-trials/what-are-trials/phases"},
        {"term": "Randomized", "definition": "Participants are assigned to treatment groups by chance (like flipping a coin), not by choice.", "url": "https://www.cancer.gov/publications/dictionaries/cancer-terms/def/randomized-clinical-trial"},
        {"term": "Double-blind", "definition": "Neither the participants nor the doctors know which treatment group a participant is in, to prevent bias.", "url": "https://www.cancer.gov/publications/dictionaries/cancer-terms/def/double-blind-study"},
        {"term": "Placebo", "definition": "An inactive treatment (like a sugar pill) used as a comparison to measure the real effects of the study treatment.", "url": "https://www.cancer.gov/publications/dictionaries/cancer-terms/def/placebo"},
        {"term": "Eligibility Criteria", "definition": "The requirements a person must meet to join a clinical trial, including medical and personal factors.", "url": "https://clinicaltrials.gov/about-studies/glossary#eligibility-criteria"},
        {"term": "Informed Consent", "definition": "The process of learning about a clinical trial before deciding whether to participate. You can withdraw at any time.", "url": "https://www.cancer.gov/about-cancer/treatment/clinical-trials/patient-safety/informed-consent"},
        {"term": "NCT Number", "definition": "A unique identification number assigned to each clinical trial registered on ClinicalTrials.gov.", "url": "https://clinicaltrials.gov/about-studies/glossary#nct-number"},
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
