"""Agent orchestrator — manages Claude conversations with tool use for clinical trial navigation."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import anthropic

from backend.config import settings
from backend.models.patient import PatientProfile
from backend.models.session import SessionPhase, SessionState
from backend.models.trial import MatchedTrial, TrialSummary
from backend.session import SessionManager

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"
SKILLS_DIR = Path(__file__).parent / "skills"


def _parse_trial_detail(raw: dict) -> dict:
    """Extract essential fields from a full study record to keep context small."""
    protocol = raw.get("protocolSection", {})
    ident = protocol.get("identificationModule", {})
    status = protocol.get("statusModule", {})
    design = protocol.get("designModule", {})
    desc = protocol.get("descriptionModule", {})
    elig = protocol.get("eligibilityModule", {})
    arms = protocol.get("armsInterventionsModule", {})
    outcomes = protocol.get("outcomesModule", {})
    sponsor = protocol.get("sponsorCollaboratorsModule", {})

    interventions = [i.get("name", "") for i in arms.get("interventions", []) if i.get("name")]
    primary_outcomes = [
        {"measure": o.get("measure", ""), "timeFrame": o.get("timeFrame", "")}
        for o in (outcomes.get("primaryOutcomes", []) or [])[:3]
    ]

    return {
        "nct_id": ident.get("nctId"),
        "brief_title": ident.get("briefTitle"),
        "official_title": ident.get("officialTitle"),
        "overall_status": status.get("overallStatus"),
        "phase": " / ".join(design.get("phases", [])),
        "study_type": design.get("studyType"),
        "brief_summary": (desc.get("briefSummary") or "")[:500],
        "detailed_description": (desc.get("detailedDescription") or "")[:500],
        "interventions": interventions,
        "primary_outcomes": primary_outcomes,
        "eligibility_criteria_text": (elig.get("eligibilityCriteria") or "")[:2000],
        "min_age": elig.get("minimumAge"),
        "max_age": elig.get("maximumAge"),
        "sex": elig.get("sex"),
        "enrollment": design.get("enrollmentInfo", {}).get("count"),
        "sponsor": sponsor.get("leadSponsor", {}).get("name"),
        "arms": [
            {"label": a.get("label", ""), "type": a.get("type", ""), "description": (a.get("description") or "")[:200]}
            for a in (arms.get("arms", []) or [])[:4]
        ],
    }


def _load_prompt(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    logger.warning("Prompt file not found: %s", path)
    return ""


def _load_skill(name: str) -> str:
    path = SKILLS_DIR / f"{name}.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def _build_system_prompt(phase: SessionPhase) -> str:
    """Build system prompt based on current conversation phase."""
    base = _load_prompt("orchestrator")
    phase_prompt = ""

    if phase == SessionPhase.INTAKE:
        phase_prompt = _load_prompt("intake")
    elif phase == SessionPhase.SEARCH:
        phase_prompt = _load_prompt("search")
    elif phase in (SessionPhase.MATCHING, SessionPhase.SELECTION):
        phase_prompt = _load_prompt("match_translate")
        phase_prompt += "\n\n" + _load_skill("eligibility_analysis")
        phase_prompt += "\n\n" + _load_skill("medical_translation")
    elif phase in (SessionPhase.REPORT, SessionPhase.FOLLOWUP):
        phase_prompt = _load_prompt("report_generator")
        phase_prompt += "\n\n" + _load_skill("medical_translation")

    return f"{base}\n\n## Current Phase: {phase.value}\n\n{phase_prompt}"


# Tool definitions for Claude API
TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_trials",
        "description": "Search ClinicalTrials.gov for clinical trials matching the patient's criteria. Returns a list of trial summaries.",
        "input_schema": {
            "type": "object",
            "properties": {
                "condition": {
                    "type": "string",
                    "description": "Medical condition to search for (e.g., 'non-small cell lung cancer')",
                },
                "intervention": {
                    "type": "string",
                    "description": "Specific intervention/treatment to filter by (optional)",
                },
                "phase": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["PHASE1", "PHASE2", "PHASE3", "PHASE4"]},
                    "description": "Trial phases to filter by",
                },
                "status": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Trial statuses to filter by. Default: ['RECRUITING']",
                },
                "latitude": {"type": "number", "description": "Patient latitude for geographic filtering"},
                "longitude": {"type": "number", "description": "Patient longitude for geographic filtering"},
                "distance_miles": {
                    "type": "integer",
                    "description": "Maximum distance from patient location in miles. Default: 100",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return. Default: 50",
                },
            },
            "required": ["condition"],
        },
    },
    {
        "name": "get_trial_details",
        "description": "Get the complete study record for a specific clinical trial by its NCT ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nct_id": {"type": "string", "description": "The NCT identifier (e.g., 'NCT12345678')"},
            },
            "required": ["nct_id"],
        },
    },
    {
        "name": "get_eligibility_criteria",
        "description": "Get parsed eligibility criteria (inclusion/exclusion lists) for a specific trial.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nct_id": {"type": "string", "description": "The NCT identifier"},
            },
            "required": ["nct_id"],
        },
    },
    {
        "name": "get_trial_locations",
        "description": "Get all recruiting site locations for a specific trial, including facility names, addresses, and coordinates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nct_id": {"type": "string", "description": "The NCT identifier"},
            },
            "required": ["nct_id"],
        },
    },
    {
        "name": "geocode_location",
        "description": "Convert a location name (city, state, zip) to latitude/longitude coordinates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "location_string": {
                    "type": "string",
                    "description": "Location to geocode (e.g., 'Lompoc, CA' or '93436')",
                },
            },
            "required": ["location_string"],
        },
    },
    {
        "name": "calculate_distance",
        "description": "Calculate the distance in miles between two geographic points.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lat1": {"type": "number"},
                "lon1": {"type": "number"},
                "lat2": {"type": "number"},
                "lon2": {"type": "number"},
            },
            "required": ["lat1", "lon1", "lat2", "lon2"],
        },
    },
    {
        "name": "get_adverse_events",
        "description": "Get the most commonly reported adverse events for a drug from the FDA database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "drug_name": {"type": "string", "description": "Generic drug name"},
                "limit": {"type": "integer", "description": "Max number of adverse events to return. Default: 20"},
            },
            "required": ["drug_name"],
        },
    },
    {
        "name": "get_drug_label",
        "description": "Get FDA-approved drug label information including indications, warnings, and dosage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "drug_name": {"type": "string", "description": "Generic drug name"},
            },
            "required": ["drug_name"],
        },
    },
    {
        "name": "save_patient_profile",
        "description": "Save or update the patient profile with information gathered during intake. Call this after gathering patient information.",
        "input_schema": {
            "type": "object",
            "properties": {
                "profile": {
                    "type": "object",
                    "description": "Patient profile data matching the PatientProfile schema",
                    "properties": {
                        "condition": {
                            "type": "object",
                            "properties": {
                                "primary_diagnosis": {"type": "string"},
                                "stage": {"type": "string"},
                                "subtype": {"type": "string"},
                                "biomarkers": {"type": "array", "items": {"type": "string"}},
                                "date_of_diagnosis": {"type": "string"},
                            },
                        },
                        "treatment_history": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "treatment": {"type": "string"},
                                    "type": {"type": "string"},
                                    "cycles_completed": {"type": "integer"},
                                    "response": {"type": "string"},
                                    "end_date": {"type": "string"},
                                },
                            },
                        },
                        "demographics": {
                            "type": "object",
                            "properties": {
                                "age": {"type": "integer"},
                                "sex": {"type": "string"},
                                "estimated_ecog": {"type": "integer"},
                            },
                        },
                        "location": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string"},
                                "latitude": {"type": "number"},
                                "longitude": {"type": "number"},
                                "max_travel_miles": {"type": "integer"},
                                "open_to_virtual": {"type": "boolean"},
                            },
                        },
                        "preferences": {
                            "type": "object",
                            "properties": {
                                "trial_types": {"type": "array", "items": {"type": "string"}},
                                "phases": {"type": "array", "items": {"type": "string"}},
                                "placebo_acceptable": {"type": "boolean"},
                                "intervention_interests": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                    },
                },
            },
            "required": ["profile"],
        },
    },
    {
        "name": "update_session_phase",
        "description": "Update the current session phase. Call this when transitioning between phases (e.g., from intake to search).",
        "input_schema": {
            "type": "object",
            "properties": {
                "phase": {
                    "type": "string",
                    "enum": ["intake", "search", "matching", "selection", "report", "followup"],
                    "description": "The new session phase",
                },
            },
            "required": ["phase"],
        },
    },
    {
        "name": "emit_widget",
        "description": "Send a structured selection widget to the user for structured input. Use this for multi-choice questions during intake or trial selection.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The question to display"},
                "widget_type": {
                    "type": "string",
                    "enum": ["single_select", "multi_select"],
                    "description": "Type of selection widget",
                },
                "options": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "value": {"type": "string"},
                            "description": {"type": "string"},
                        },
                        "required": ["label", "value"],
                    },
                    "description": "Options for the user to select from",
                },
            },
            "required": ["question", "widget_type", "options"],
        },
    },
    {
        "name": "emit_trial_cards",
        "description": "Send trial summary cards to the user for review or selection.",
        "input_schema": {
            "type": "object",
            "properties": {
                "trials": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "nct_id": {"type": "string"},
                            "brief_title": {"type": "string"},
                            "phase": {"type": "string"},
                            "overall_status": {"type": "string"},
                            "fit_score": {"type": "number"},
                            "fit_summary": {"type": "string"},
                            "nearest_distance_miles": {"type": "number"},
                            "interventions": {"type": "array", "items": {"type": "string"}},
                            "sponsor": {"type": "string"},
                        },
                    },
                },
                "selectable": {
                    "type": "boolean",
                    "description": "Whether the user can select trials from this list",
                },
            },
            "required": ["trials"],
        },
    },
    {
        "name": "emit_status",
        "description": "Send a status update to the user showing current progress (e.g., 'Searching ClinicalTrials.gov...').",
        "input_schema": {
            "type": "object",
            "properties": {
                "phase": {"type": "string", "description": "Current phase identifier"},
                "message": {"type": "string", "description": "Human-readable status message"},
            },
            "required": ["phase", "message"],
        },
    },
    {
        "name": "save_matched_trials",
        "description": "Save scored and ranked trial matches after eligibility analysis. Populate ALL fields for a complete report — especially inclusion_scores, exclusion_scores, what_to_expect, plain_language_summary, nearest_location, and adverse_events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "trials": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "nct_id": {"type": "string"},
                            "brief_title": {"type": "string"},
                            "phase": {"type": "string"},
                            "overall_status": {"type": "string"},
                            "fit_score": {
                                "type": "number",
                                "description": "Fit score as a percentage integer from 0 to 100 (e.g. 65 for 65% fit). Do NOT use a 0-1 decimal.",
                            },
                            "fit_summary": {"type": "string"},
                            "plain_language_summary": {
                                "type": "string",
                                "description": "A plain-language explanation of what this trial is studying, written at an 8th grade reading level.",
                            },
                            "what_to_expect": {
                                "type": "string",
                                "description": "What the patient should expect if they participate — visit frequency, procedures, duration, etc.",
                            },
                            "inclusion_scores": {
                                "type": "array",
                                "description": "Scored inclusion criteria with icons and plain-language explanations.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "criterion": {"type": "string"},
                                        "status": {
                                            "type": "string",
                                            "enum": ["met", "not_met", "needs_discussion", "not_enough_info"],
                                        },
                                        "icon": {
                                            "type": "string",
                                            "description": "Status icon: use ✅ for met, ❌ for not_met, ❓ for needs_discussion, ➖ for not_enough_info",
                                        },
                                        "explanation": {"type": "string"},
                                        "plain_language": {"type": "string"},
                                    },
                                    "required": ["criterion", "status", "icon"],
                                },
                            },
                            "exclusion_scores": {
                                "type": "array",
                                "description": "Scored exclusion criteria with icons and plain-language explanations.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "criterion": {"type": "string"},
                                        "status": {
                                            "type": "string",
                                            "enum": ["met", "not_met", "needs_discussion", "not_enough_info"],
                                        },
                                        "icon": {
                                            "type": "string",
                                            "description": "Status icon: use ✅ for met (patient does NOT have exclusion), ❌ for not_met (patient HAS exclusion), ❓ for needs_discussion, ➖ for not_enough_info",
                                        },
                                        "explanation": {"type": "string"},
                                        "plain_language": {"type": "string"},
                                    },
                                    "required": ["criterion", "status", "icon"],
                                },
                            },
                            "nearest_location": {
                                "type": "object",
                                "description": "The nearest trial site to the patient.",
                                "properties": {
                                    "facility": {"type": "string"},
                                    "city": {"type": "string"},
                                    "state": {"type": "string"},
                                    "country": {"type": "string"},
                                    "distance_miles": {"type": "number"},
                                    "contact_phone": {"type": "string"},
                                    "contact_email": {"type": "string"},
                                },
                            },
                            "adverse_events": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Most commonly reported adverse events/side effects for the trial's intervention(s).",
                            },
                            "interventions": {"type": "array", "items": {"type": "string"}},
                            "enrollment_count": {"type": "integer", "description": "Number of participants enrolled or planned."},
                            "start_date": {"type": "string", "description": "Trial start date."},
                            "sponsor": {"type": "string"},
                        },
                    },
                },
            },
            "required": ["trials"],
        },
    },
    {
        "name": "generate_report",
        "description": "Generate the final HTML report for the patient. Call this during the report phase after all trials have been analyzed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "questions_for_doctor": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Personalized questions for the patient to ask their doctor.",
                },
                "glossary": {
                    "type": "object",
                    "description": "Dictionary of medical terms and their plain language definitions.",
                },
            },
        },
    },
    {
        "name": "get_health_import_summary",
        "description": "Get a summary of the patient's imported Apple Health data, including lab results, vitals, medications, and activity levels. Returns null if no health data has been imported. Use this during eligibility analysis to access objective health measurements.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
]


class AgentOrchestrator:
    """Manages Claude conversations with tool use for clinical trial navigation."""

    def __init__(self, session_id: str, session_mgr: SessionManager):
        self.session_id = session_id
        self.session_mgr = session_mgr
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.conversation_history: list[dict[str, Any]] = []
        self._pending_emissions: list[dict[str, Any]] = []
        self._intake_answers: dict[str, str] = {}
        self._free_text_counter: int = 0
        self._detected_location: dict[str, Any] | None = None

    def _extract_intake_answer(self, user_message: str) -> None:
        """Parse structured widget responses and free-text messages during intake.

        Widget responses arrive as: Question: "..." — My answer: ...
        Free-text messages (initial condition description) stored as free_text_N.
        """
        import re

        # Match widget response format: Question: "..." — My answer: ...
        # Handles both em-dash (—) and double-hyphen (--)
        match = re.match(r'^Question:\s*"(.+?)"\s*(?:—|--)\s*My answer:\s*(.+)$', user_message)
        if match:
            question = match.group(1).strip()
            answer = match.group(2).strip()
            self._intake_answers[question] = answer
        else:
            # Free-text input (e.g., initial condition description)
            self._free_text_counter += 1
            self._intake_answers[f"free_text_{self._free_text_counter}"] = user_message.strip()

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """Execute a tool call and return the result as a string."""
        try:
            if tool_name == "search_trials":
                from backend.mcp_servers.clinical_trials import search_trials
                results = await search_trials(**tool_input)
                # Save to session — filter out entries with no NCT ID
                valid = [r for r in results if r.get("nct_id")]
                trials = [TrialSummary(**r) for r in valid]
                self.session_mgr.save_search_results(self.session_id, trials)
                # Update session state
                state = self.session_mgr.get_state(self.session_id)
                state.search_complete = True
                self.session_mgr.save_state(self.session_id, state)
                # Emit filters to sync the stats panel.
                # Only emit statuses — do NOT override condition, since the user's
                # original condition was set on first message and Claude may search
                # with a broader/different term (e.g. "bone sarcoma" vs "ewing sarcoma").
                emission: dict[str, Any] = {"type": "filters_update"}
                if tool_input.get("status"):
                    emission["statuses"] = tool_input["status"]
                if len(emission) > 1:
                    self._pending_emissions.append(emission)
                # Return slim summaries to keep context small
                slim = [
                    {
                        "nct_id": r.get("nct_id"),
                        "brief_title": r.get("brief_title", "")[:120],
                        "phase": r.get("phase", ""),
                        "overall_status": r.get("overall_status", ""),
                        "interventions": r.get("interventions", [])[:3],
                        "sponsor": r.get("sponsor", ""),
                        "enrollment_count": r.get("enrollment_count"),
                        "nearest_city": (r.get("locations", [{}])[0].get("city", "") + ", " + r.get("locations", [{}])[0].get("state", "")) if r.get("locations") else "",
                    }
                    for r in valid[:15]
                ]
                return json.dumps({"count": len(valid), "trials": slim}, default=str)

            elif tool_name == "get_trial_details":
                from backend.mcp_servers.clinical_trials import get_trial_details
                result = await get_trial_details(tool_input["nct_id"])
                # Extract only the fields Claude needs, skip raw protocol
                summary = _parse_trial_detail(result)
                return json.dumps(summary, default=str)

            elif tool_name == "get_eligibility_criteria":
                from backend.mcp_servers.clinical_trials import get_eligibility_criteria
                result = await get_eligibility_criteria(tool_input["nct_id"])
                return json.dumps(result, default=str)

            elif tool_name == "get_trial_locations":
                from backend.mcp_servers.clinical_trials import get_trial_locations
                result = await get_trial_locations(tool_input["nct_id"])
                # Limit to 10 closest locations to save context
                return json.dumps(result[:10], default=str)

            elif tool_name == "geocode_location":
                from backend.mcp_servers.geocoding import geocode_location
                result = await geocode_location(tool_input["location_string"])
                return json.dumps(result, default=str)

            elif tool_name == "calculate_distance":
                from backend.mcp_servers.geocoding import calculate_distance
                result = calculate_distance(
                    tool_input["lat1"], tool_input["lon1"],
                    tool_input["lat2"], tool_input["lon2"],
                )
                return json.dumps({"distance_miles": result})

            elif tool_name == "get_adverse_events":
                from backend.mcp_servers.fda_data import get_adverse_events
                result = await get_adverse_events(
                    tool_input["drug_name"],
                    tool_input.get("limit", 20),
                )
                return json.dumps(result, default=str)

            elif tool_name == "get_drug_label":
                from backend.mcp_servers.fda_data import get_drug_label
                result = await get_drug_label(tool_input["drug_name"])
                # Truncate long label fields
                if isinstance(result, dict):
                    for key in result:
                        if isinstance(result[key], str) and len(result[key]) > 1000:
                            result[key] = result[key][:1000] + "..."
                return json.dumps(result, default=str)

            elif tool_name == "save_patient_profile":
                profile = PatientProfile(**tool_input["profile"])
                self.session_mgr.save_profile(self.session_id, profile)
                state = self.session_mgr.get_state(self.session_id)
                state.profile_complete = True
                self.session_mgr.save_state(self.session_id, state)
                # Emit condition filter from profile to sync the stats panel.
                # Note: age/sex are NOT sent because search_trials doesn't filter
                # by them — eligibility is evaluated during matching, not search.
                # Sending them would create a false narrowing (0 results in AACT
                # while the chat still finds trials via the live API).
                profile_emission: dict[str, Any] = {
                    "type": "filters_update",
                    "condition": profile.condition.primary_diagnosis if profile.condition else "",
                }
                if profile.location:
                    if profile.location.description:
                        profile_emission["location"] = profile.location.description
                    if profile.location.latitude and profile.location.longitude:
                        profile_emission["latitude"] = profile.location.latitude
                        profile_emission["longitude"] = profile.location.longitude
                    if profile.location.max_travel_miles:
                        profile_emission["distance_miles"] = profile.location.max_travel_miles
                self._pending_emissions.append(profile_emission)
                return json.dumps({"status": "saved", "profile": profile.model_dump()})

            elif tool_name == "update_session_phase":
                state = self.session_mgr.get_state(self.session_id)
                state.phase = SessionPhase(tool_input["phase"])
                self.session_mgr.save_state(self.session_id, state)
                self._pending_emissions.append({
                    "type": "status",
                    "phase": tool_input["phase"],
                    "message": f"Moving to {tool_input['phase']} phase...",
                })
                return json.dumps({"status": "updated", "phase": tool_input["phase"]})

            elif tool_name == "emit_widget":
                self._pending_emissions.append({
                    "type": "widget",
                    "widget_type": tool_input["widget_type"],
                    "question": tool_input["question"],
                    "question_id": f"q_{len(self._pending_emissions)}",
                    "options": tool_input["options"],
                })
                return json.dumps({"status": "widget_emitted"})

            elif tool_name == "emit_trial_cards":
                self._pending_emissions.append({
                    "type": "trial_cards",
                    "trials": tool_input["trials"],
                    "selectable": tool_input.get("selectable", False),
                })
                return json.dumps({"status": "trial_cards_emitted", "count": len(tool_input["trials"])})

            elif tool_name == "emit_status":
                self._pending_emissions.append({
                    "type": "status",
                    "phase": tool_input["phase"],
                    "message": tool_input["message"],
                })
                return json.dumps({"status": "status_emitted"})

            elif tool_name == "save_matched_trials":
                trials_data = tool_input.get("trials", [])
                # Normalize fit_score: if Claude passed a 0-1 float, convert to 0-100 percentage
                for t in trials_data:
                    score = t.get("fit_score", 0)
                    if isinstance(score, (int, float)) and 0 < score <= 1.0:
                        t["fit_score"] = score * 100
                matched = [MatchedTrial(**t) for t in trials_data]
                self.session_mgr.save_matched_trials(self.session_id, matched)
                state = self.session_mgr.get_state(self.session_id)
                state.matching_complete = True
                self.session_mgr.save_state(self.session_id, state)
                return json.dumps({"status": "saved", "count": len(matched)})

            elif tool_name == "generate_report":
                from backend.report.generator import generate_report
                profile = self.session_mgr.get_profile(self.session_id)
                matched = self.session_mgr.get_matched_trials(self.session_id)
                questions = tool_input.get("questions_for_doctor")
                glossary_raw = tool_input.get("glossary")
                # Convert dict glossary to list format expected by generator
                glossary = None
                if isinstance(glossary_raw, dict):
                    glossary = [
                        {"term": k, "definition": v}
                        for k, v in glossary_raw.items()
                    ]
                elif isinstance(glossary_raw, list):
                    glossary = glossary_raw
                html = generate_report(profile, matched, questions, glossary)
                self.session_mgr.save_report(self.session_id, html)
                state = self.session_mgr.get_state(self.session_id)
                state.report_generated = True
                self.session_mgr.save_state(self.session_id, state)
                report_url = f"/api/sessions/{self.session_id}/report"
                emission: dict[str, Any] = {
                    "type": "report_ready",
                    "url": report_url,
                }
                result_data: dict[str, Any] = {"status": "generated", "url": report_url}
                # Only advertise PDF if Playwright is available
                try:
                    from backend.report.pdf_generator import check_playwright_browsers
                    if check_playwright_browsers():
                        pdf_url = f"/api/sessions/{self.session_id}/report.pdf"
                        emission["pdf_url"] = pdf_url
                        result_data["pdf_url"] = pdf_url
                except Exception:
                    pass
                self._pending_emissions.append(emission)
                return json.dumps(result_data)

            elif tool_name == "get_health_import_summary":
                profile = self.session_mgr.get_profile(self.session_id)
                hk = profile.health_kit
                if not hk.lab_results and not hk.vitals and not hk.medications and hk.activity_steps_per_day is None:
                    return json.dumps({"imported": False, "message": "No health data imported"})
                from backend.mcp_servers.apple_health import estimate_ecog_from_steps
                return json.dumps({
                    "imported": True,
                    "lab_results": [lr.model_dump() for lr in hk.lab_results],
                    "vitals": [v.model_dump() for v in hk.vitals],
                    "medications": [m.model_dump() for m in hk.medications],
                    "activity_steps_per_day": hk.activity_steps_per_day,
                    "activity_active_minutes_per_day": hk.activity_active_minutes_per_day,
                    "estimated_ecog": estimate_ecog_from_steps(hk.activity_steps_per_day) if hk.activity_steps_per_day else None,
                    "import_date": hk.import_date,
                })

            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})

        except Exception as e:
            logger.exception("Tool execution failed: %s", tool_name)
            return json.dumps({"error": str(e)})

    def _trim_history(self, state: SessionState | None = None):
        """Trim conversation history to prevent context overflow.

        During INTAKE phase, uses a higher threshold (50) to preserve more Q&A pairs.
        In other phases, keeps the first 2 messages and the last 20 (threshold 24).
        Answers are also preserved in the system prompt via _intake_answers, so trimming
        during intake is a secondary safety net.
        """
        threshold = 24
        if state and state.phase == SessionPhase.INTAKE and not state.profile_complete:
            threshold = 50

        if len(self.conversation_history) <= threshold:
            return
        kept_start = self.conversation_history[:2]
        kept_end = self.conversation_history[-20:]
        self.conversation_history = kept_start + [
            {"role": "user", "content": "[Earlier conversation trimmed to save context. See session state for details.]"}
        ] + kept_end

    async def process_message(self, user_message: str):
        """Process a user message and yield response chunks.

        Yields dicts with:
        - {"type": "text", "content": "..."} for text chunks
        - {"type": "text_done"} when text is complete
        - {"type": "widget", ...} for widget emissions
        - {"type": "trial_cards", ...} for trial cards
        - {"type": "status", ...} for status updates
        - {"type": "done"} when fully complete
        """
        state = self.session_mgr.get_state(self.session_id)
        system_prompt = _build_system_prompt(state.phase)

        # Add context about the current session state
        session_context = self._build_session_context(state)
        full_system = f"{system_prompt}\n\n## Session Context\n{session_context}"

        # Extract intake answers before they can be trimmed
        if state.phase == SessionPhase.INTAKE and not state.profile_complete:
            self._extract_intake_answer(user_message)

        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message,
        })

        # Trim history to prevent context overflow
        self._trim_history(state)

        # Agentic loop: keep calling Claude until it stops using tools
        max_iterations = 15
        for iteration in range(max_iterations):
            self._pending_emissions = []

            # Stream the response
            text_chunks: list[str] = []
            tool_uses: list[dict] = []

            async with self.client.messages.stream(
                model=settings.model,
                max_tokens=4096,
                system=full_system,
                tools=TOOLS,
                messages=self.conversation_history,
            ) as stream:
                current_tool_use = None
                _tool_json_len = 0  # Track JSON size for progress updates

                # Map tool names to user-friendly status messages
                _TOOL_STATUS = {
                    "save_matched_trials": ("matching", "Compiling detailed trial analysis..."),
                    "generate_report": ("report", "Building your personalized report..."),
                    "save_patient_profile": ("intake", "Saving your profile..."),
                    "search_trials": ("search", "Preparing search..."),
                }

                async for event in stream:
                    if event.type == "content_block_start":
                        if hasattr(event.content_block, "type"):
                            if event.content_block.type == "text":
                                pass  # Will get text via deltas
                            elif event.content_block.type == "tool_use":
                                current_tool_use = {
                                    "id": event.content_block.id,
                                    "name": event.content_block.name,
                                    "input_json": "",
                                }
                                _tool_json_len = 0
                                # Emit status when tool generation starts
                                status = _TOOL_STATUS.get(event.content_block.name)
                                if status:
                                    yield {"type": "status", "phase": status[0], "message": status[1]}

                    elif event.type == "content_block_delta":
                        if hasattr(event.delta, "text"):
                            text_chunks.append(event.delta.text)
                            yield {"type": "text", "content": event.delta.text}
                        elif hasattr(event.delta, "partial_json"):
                            if current_tool_use is not None:
                                current_tool_use["input_json"] += event.delta.partial_json
                                _tool_json_len += len(event.delta.partial_json)
                                # Emit progress for large tool outputs (every ~10KB)
                                if _tool_json_len > 10000 and _tool_json_len % 10000 < len(event.delta.partial_json):
                                    kb = _tool_json_len // 1024
                                    name = current_tool_use["name"]
                                    status = _TOOL_STATUS.get(name)
                                    if status:
                                        yield {"type": "status", "phase": status[0], "message": f"{status[1]} ({kb}KB processed)"}

                    elif event.type == "content_block_stop":
                        if current_tool_use is not None:
                            try:
                                current_tool_use["input"] = json.loads(
                                    current_tool_use["input_json"] or "{}"
                                )
                            except json.JSONDecodeError:
                                current_tool_use["input"] = {}
                            tool_uses.append(current_tool_use)
                            current_tool_use = None

                # Get the final message for stop_reason
                response = await stream.get_final_message()

            # Build the assistant message content for history
            assistant_content = []
            if text_chunks:
                assistant_content.append({
                    "type": "text",
                    "text": "".join(text_chunks),
                })
            for tu in tool_uses:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tu["id"],
                    "name": tu["name"],
                    "input": tu["input"],
                })

            self.conversation_history.append({
                "role": "assistant",
                "content": assistant_content,
            })

            # If there are text chunks, signal text is done
            if text_chunks:
                yield {"type": "text_done"}

            # If no tool use, we're done
            if response.stop_reason != "tool_use" or not tool_uses:
                # Emit any pending UI elements
                for emission in self._pending_emissions:
                    yield emission
                yield {"type": "done"}
                return

            # Execute tools and build tool results
            tool_results = []
            for tu in tool_uses:
                # Emit status for certain tools
                if tu["name"] in ("search_trials",):
                    yield {
                        "type": "status",
                        "phase": "searching",
                        "message": "Searching ClinicalTrials.gov...",
                    }
                elif tu["name"] in ("get_trial_details", "get_eligibility_criteria"):
                    yield {
                        "type": "status",
                        "phase": "analyzing",
                        "message": f"Analyzing trial {tu['input'].get('nct_id', '')}...",
                    }
                elif tu["name"] in ("get_adverse_events", "get_drug_label"):
                    yield {
                        "type": "status",
                        "phase": "fda_lookup",
                        "message": f"Looking up FDA data for {tu['input'].get('drug_name', '')}...",
                    }
                elif tu["name"] == "save_matched_trials":
                    trial_count = len(tu["input"].get("trials", []))
                    yield {
                        "type": "status",
                        "phase": "matching",
                        "message": f"Saving {trial_count} matched trials...",
                    }
                elif tu["name"] == "generate_report":
                    yield {
                        "type": "status",
                        "phase": "report",
                        "message": "Generating your personalized report...",
                    }
                elif tu["name"] == "geocode_location":
                    yield {
                        "type": "status",
                        "phase": "geocoding",
                        "message": f"Looking up location: {tu['input'].get('location_string', '')}...",
                    }
                elif tu["name"] == "calculate_distance":
                    yield {
                        "type": "status",
                        "phase": "matching",
                        "message": "Calculating distance to trial site...",
                    }
                elif tu["name"] == "get_trial_locations":
                    yield {
                        "type": "status",
                        "phase": "matching",
                        "message": f"Fetching locations for {tu['input'].get('nct_id', '')}...",
                    }
                elif tu["name"] == "get_health_import_summary":
                    yield {
                        "type": "status",
                        "phase": "matching",
                        "message": "Reviewing imported health data...",
                    }
                elif tu["name"] == "save_patient_profile":
                    yield {
                        "type": "status",
                        "phase": "intake",
                        "message": "Compiling your patient profile...",
                    }
                elif tu["name"] == "update_session_phase":
                    phase_name = tu["input"].get("phase", "next")
                    yield {
                        "type": "status",
                        "phase": phase_name,
                        "message": f"Transitioning to {phase_name} phase...",
                    }
                elif tu["name"] == "emit_widget":
                    yield {
                        "type": "status",
                        "phase": "intake",
                        "message": "Preparing question...",
                    }
                elif tu["name"] == "emit_trial_cards":
                    trial_count = len(tu["input"].get("trials", []))
                    yield {
                        "type": "status",
                        "phase": "selection",
                        "message": f"Presenting {trial_count} trial cards...",
                    }
                elif tu["name"] == "emit_status":
                    pass  # emit_status handles itself
                else:
                    yield {
                        "type": "status",
                        "phase": state.phase.value,
                        "message": f"Running {tu['name']}...",
                    }

                result = await self._execute_tool(tu["name"], tu["input"])
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": result,
                })

            # Emit any pending UI elements from tool execution
            for emission in self._pending_emissions:
                yield emission

            # Add tool results to conversation
            self.conversation_history.append({
                "role": "user",
                "content": tool_results,
            })

            # Continue the loop — Claude will process tool results

        # If we hit max iterations
        yield {"type": "text", "content": "\n\nI've been working on this for a while. Let me know if you'd like me to continue or if you have any questions."}
        yield {"type": "text_done"}
        yield {"type": "done"}

    def _build_session_context(self, state: SessionState) -> str:
        """Build context string from session state for the system prompt."""
        parts = [f"Session ID: {self.session_id}"]
        parts.append(f"Current phase: {state.phase.value}")
        parts.append(f"Profile complete: {state.profile_complete}")
        parts.append(f"Search complete: {state.search_complete}")
        parts.append(f"Matching complete: {state.matching_complete}")
        parts.append(f"Report generated: {state.report_generated}")

        if self._detected_location:
            loc = self._detected_location
            parts.append(
                f"\nBrowser-detected location: {loc.get('display', 'Unknown')} "
                f"(lat {loc.get('latitude', '')}, lon {loc.get('longitude', '')}). "
                f"During intake, confirm this with the user and allow them to override."
            )

        # During intake, inject all collected answers so they survive history trimming
        if self._intake_answers and not state.profile_complete:
            answers_section = "\nCollected Patient Answers (use these when compiling the profile):"
            for q, a in self._intake_answers.items():
                if q.startswith("free_text_"):
                    answers_section += f"\n- Patient description: {a}"
                else:
                    answers_section += f"\n- {q}: {a}"
            parts.append(answers_section)

        if state.profile_complete:
            try:
                profile = self.session_mgr.get_profile(self.session_id)
                parts.append(f"\nPatient profile:\n{json.dumps(profile.model_dump(), indent=2, default=str)}")
                hk = profile.health_kit
                if hk.lab_results or hk.vitals or hk.medications or hk.activity_steps_per_day:
                    parts.append(f"\nApple Health data imported: {len(hk.lab_results)} lab results, "
                                 f"{len(hk.vitals)} vitals, {len(hk.medications)} medications, "
                                 f"avg steps/day: {hk.activity_steps_per_day}")
            except Exception:
                pass

        if state.selected_trial_ids:
            parts.append(f"\nSelected trial IDs: {', '.join(state.selected_trial_ids)}")

        return "\n".join(parts)
