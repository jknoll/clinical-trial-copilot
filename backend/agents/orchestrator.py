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
        "description": "Save scored and ranked trial matches after eligibility analysis.",
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
                            "plain_language_summary": {"type": "string"},
                            "interventions": {"type": "array", "items": {"type": "string"}},
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
]


class AgentOrchestrator:
    """Manages Claude conversations with tool use for clinical trial navigation."""

    def __init__(self, session_id: str, session_mgr: SessionManager):
        self.session_id = session_id
        self.session_mgr = session_mgr
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.conversation_history: list[dict[str, Any]] = []
        self._pending_emissions: list[dict[str, Any]] = []

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
                return json.dumps({"status": "saved", "profile": profile.model_dump()})

            elif tool_name == "update_session_phase":
                state = self.session_mgr.get_state(self.session_id)
                state.phase = SessionPhase(tool_input["phase"])
                self.session_mgr.save_state(self.session_id, state)
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
                self._pending_emissions.append({
                    "type": "report_ready",
                    "url": report_url,
                })
                return json.dumps({"status": "generated", "url": report_url})

            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})

        except Exception as e:
            logger.exception("Tool execution failed: %s", tool_name)
            return json.dumps({"error": str(e)})

    def _trim_history(self):
        """Trim conversation history to prevent context overflow.

        Keeps the first 2 messages (initial exchange) and the last 20 messages.
        Replaces middle messages with a summary marker.
        """
        if len(self.conversation_history) <= 24:
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

        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message,
        })

        # Trim history to prevent context overflow
        self._trim_history()

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

                    elif event.type == "content_block_delta":
                        if hasattr(event.delta, "text"):
                            text_chunks.append(event.delta.text)
                            yield {"type": "text", "content": event.delta.text}
                        elif hasattr(event.delta, "partial_json"):
                            if current_tool_use is not None:
                                current_tool_use["input_json"] += event.delta.partial_json

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

        if state.profile_complete:
            try:
                profile = self.session_mgr.get_profile(self.session_id)
                parts.append(f"\nPatient profile:\n{json.dumps(profile.model_dump(), indent=2, default=str)}")
            except Exception:
                pass

        if state.selected_trial_ids:
            parts.append(f"\nSelected trial IDs: {', '.join(state.selected_trial_ids)}")

        return "\n".join(parts)
