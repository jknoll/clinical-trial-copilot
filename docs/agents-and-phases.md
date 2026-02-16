# Agents and Phases

Clinical Trial Navigator uses a single Claude orchestrator that progresses through six phases, each with a specialized system prompt. This is not a multi-process agent framework — it is one conversation with Claude that changes its instructions as the session progresses.

For the runtime mechanics (agentic loop, tool execution, context management), see [Architecture](architecture.md). For the complete tool reference, see [Tools](tools.md).

---

## Architecture

### Single Orchestrator, Phase-Specific Prompts

Each API call to Claude receives a system prompt assembled from:

```
Base prompt (orchestrator.md)
  + Phase-specific prompt (e.g., intake.md)
  + Skill prompts (e.g., eligibility_analysis.md, medical_translation.md)
  + Session context (phase, profile, health data, collected answers)
```

**Prompt files:** [`backend/agents/prompts/`](../backend/agents/prompts/) (6 files)
**Skill files:** [`backend/agents/skills/`](../backend/agents/skills/) (2 files)

### Why Not Multi-Agent?

A single orchestrator with phase-specific prompts was chosen over a multi-agent architecture (separate processes or conversations per phase) because:

- **Simpler state management** — One conversation history, one session object, no inter-agent message passing
- **Shared context** — Later phases naturally have access to earlier conversation turns
- **Lower latency** — No cold-start overhead for spawning new agent conversations
- **Sufficient for demo scope** — The prompt-switching approach handles six phases without context exhaustion for typical sessions

The trade-off is that very long sessions could approach context limits. This is mitigated by conversation trimming (see [Architecture — Context Engineering](architecture.md#context-engineering)).

---

## Phase Details

### Phase 1: INTAKE

**Objective:** Conduct an empathetic patient interview, gathering all information needed for trial search and eligibility matching.

**Prompt file:** [`intake.md`](../backend/agents/prompts/intake.md)

**Key tools used:**
- `emit_widget` — Structured selection widgets for multi-choice questions (condition type, treatment history, preferences)
- `emit_partial_filters` — Incrementally updates the stats panel as each answer is collected
- `geocode_location` — Converts patient's location text to coordinates
- `save_patient_profile` — Persists the complete profile when intake is finished

**Transition trigger:** Claude calls `save_patient_profile` with a complete profile, then calls `update_session_phase(phase="search")`.

**Key behaviors:**
- Asks one question at a time (never front-loads multiple questions)
- Uses widgets for structured choices, free text for open-ended questions
- Warm, empathetic tone — acknowledges the patient's situation before asking clinical questions
- Validates and confirms key facts (diagnosis, stage, prior treatments)
- Collects: condition/diagnosis, stage/subtype, biomarkers, treatment history, demographics (age, sex), location + travel willingness, trial type preferences, phase preferences
- Intake answers are double-stored (in conversation history AND session state) for resilience against history trimming
- History trimming threshold is raised to 50 messages during intake (vs. 24 normally) to preserve the full interview

### Phase 2: SEARCH

**Objective:** Find relevant clinical trials using multiple search strategies, then transition to matching.

**Prompt file:** [`search.md`](../backend/agents/prompts/search.md)

**Key tools used:**
- `search_trials` — Called multiple times with different strategies
- `emit_status` — Progress messages ("Searching for exact condition match...", "Broadening to category search...")
- `update_session_phase` — Transitions to matching when search is complete

**Transition trigger:** Search results collected, Claude transitions to `matching` phase.

**Key behaviors:**
- Runs up to 5 search strategies in sequence:
  1. Exact condition match with geographic filtering
  2. Broader category search (e.g., "sarcoma" instead of "Ewing sarcoma")
  3. Intervention-specific search (if patient mentioned treatments of interest)
  4. Geographic expansion (wider radius or no geographic filter)
  5. Phase-specific search (targeting patient's preferred trial phases)
- Deduplicates results by NCT ID across all strategies
- Post-fetch condition validation filters out irrelevant trials returned by ClinicalTrials.gov's fuzzy matching (see [Data Sources — ClinicalTrials.gov](data-sources.md#clinicaltrialsgov-api-v2))
- Reports total unique trials found and search strategy summary
- Saves combined results to session state

### Phase 3: MATCHING

**Objective:** Evaluate each trial's eligibility criteria against the patient profile, score fit, and translate medical language to plain English.

**Prompt file:** [`match_translate.md`](../backend/agents/prompts/match_translate.md)
**Skills loaded:** [`eligibility_analysis.md`](../backend/agents/skills/eligibility_analysis.md), [`medical_translation.md`](../backend/agents/skills/medical_translation.md)

**Key tools used:**
- `get_eligibility_criteria` — Fetches inclusion/exclusion criteria for each trial
- `get_trial_details` — Full study record for context
- `get_trial_locations` — Nearest sites with distance calculations
- `get_adverse_events` — Side effect data for the trial's interventions
- `get_drug_label` — FDA label information
- `get_health_import_summary` — Imported Apple Health data for objective measurements
- `emit_status` — Progress updates ("Analyzing Trial 3 of 8...")
- `save_matched_trials` — Persists scored results
- `emit_trial_cards` — Sends ranked trial cards to the frontend

**Transition trigger:** Claude calls `save_matched_trials` with all scored trials, then emits trial cards and transitions to `selection`.

**Key behaviors:**
- Four-level eligibility scoring for each criterion:
  - **Met** (likely meets criterion based on profile)
  - **Not Met** (likely does not meet criterion)
  - **Needs Discussion** (ambiguous, requires doctor input)
  - **Not Enough Info** (insufficient data to assess)
- Each criterion gets a plain-language translation at 8th-grade reading level
- Fit scores are integers 0–100 (not decimals)
- Trials are ranked by fit score, highest first
- Adverse events are fetched for each trial's interventions
- "What to expect" section generated for each trial (visit frequency, procedures, duration)
- Emits frequent status updates to keep the user informed during analysis

### Phase 4: SELECTION

**Objective:** Present ranked trials to the patient and let them choose which ones to include in their report.

**Prompt file:** [`selection.md`](../backend/agents/prompts/selection.md)

**Key tools used:**
- `emit_trial_cards` — Sends selectable trial cards (if not already sent)
- `emit_status` — Status messages
- `update_session_phase` — Transitions to report after selection

**Transition trigger:** Patient selects trials (via checkbox UI), frontend sends `trial_selection` WebSocket message, Claude transitions to `report` phase.

**Key behaviors:**
- Human-in-the-loop checkpoint — the system pauses and waits for patient input
- Trials are presented as interactive cards with fit scores, summaries, and key metadata
- Patient can select any combination of trials
- Claude offers to answer questions about specific trials before the patient commits
- Map view shows trial site locations

### Phase 5: REPORT

**Objective:** Generate a comprehensive, printable report for the patient to bring to their doctor.

**Prompt file:** [`report_generator.md`](../backend/agents/prompts/report_generator.md)
**Skill loaded:** [`medical_translation.md`](../backend/agents/skills/medical_translation.md)

**Key tools used:**
- `generate_report` — Creates the HTML report with questions for doctor and glossary
- `emit_status` — "Generating your report..."

**Transition trigger:** Report generated, Claude transitions to `followup` phase.

**Report contents:**
- Executive summary of the patient's situation
- Patient profile summary
- For each selected trial:
  - Plain-language summary
  - Fit score with visual indicator
  - Eligibility checklist (inclusion + exclusion with icons)
  - What to expect
  - Adverse events
  - Nearest location with contact info
- Comparison table across all selected trials
- Personalized questions to ask the doctor
- Glossary of medical terms
- Medical disclaimer

**Implementation:** Jinja2 HTML template ([`backend/report/templates/report.html`](../backend/report/templates/report.html)) with optional Playwright PDF export. See [Architecture — Report Generation](architecture.md#report-generation).

### Phase 6: FOLLOWUP

**Objective:** Open-ended conversation after the report. Patient can ask questions, request report changes, or explore additional trials.

**Prompt file:** [`report_generator.md`](../backend/agents/prompts/report_generator.md) (reuses report phase prompt)
**Skill loaded:** [`medical_translation.md`](../backend/agents/skills/medical_translation.md)

**Key tools used:**
- All tools remain available
- `generate_report` — Can regenerate the report if patient requests changes

**Transition trigger:** None — this is the terminal phase.

**Key behaviors:**
- Answers questions about specific trials, eligibility criteria, or medical terms
- Can re-search if patient wants to explore different conditions or locations
- Can regenerate the report with different trial selections or updated information
- Maintains the same warm, informative tone

---

## Phase Transition Flow

```
INTAKE ──► SEARCH ──► MATCHING ──► SELECTION ──► REPORT ──► FOLLOWUP
  │                                     │                       │
  │          save_patient_profile        │    trial_selection    │
  │          update_session_phase        │    (from frontend)    │
  │                                     │                       │
  └─ Collects profile ─────────────────►└─ Human checkpoint ───►└─ Open-ended
```

Each transition is triggered by Claude calling `update_session_phase`, which:
1. Updates the session state JSON
2. Causes the next API call to rebuild the system prompt with the new phase's instructions

The frontend also triggers transitions implicitly — for example, when the patient selects trials, the WebSocket handler injects a `trial_selection` message that prompts Claude to advance to the report phase.

---

## Prompt Loading

Prompts are loaded from disk on every `_build_system_prompt` call (no caching), which means prompt files can be edited during development without restarting the server.

```python
# backend/agents/orchestrator.py

PROMPTS_DIR = Path(__file__).parent / "prompts"
SKILLS_DIR  = Path(__file__).parent / "skills"

def _build_system_prompt(phase: SessionPhase) -> str:
    base = _load_prompt("orchestrator")     # Always loaded
    phase_prompt = ""

    if phase == SessionPhase.INTAKE:
        phase_prompt = _load_prompt("intake")
    elif phase == SessionPhase.SEARCH:
        phase_prompt = _load_prompt("search")
    elif phase == SessionPhase.MATCHING:
        phase_prompt = _load_prompt("match_translate")
        phase_prompt += "\n\n" + _load_skill("eligibility_analysis")
        phase_prompt += "\n\n" + _load_skill("medical_translation")
    elif phase == SessionPhase.SELECTION:
        phase_prompt = _load_prompt("selection")
    elif phase in (SessionPhase.REPORT, SessionPhase.FOLLOWUP):
        phase_prompt = _load_prompt("report_generator")
        phase_prompt += "\n\n" + _load_skill("medical_translation")

    return f"{base}\n\n## Current Phase: {phase.value}\n\n{phase_prompt}"
```

The full system prompt sent to Claude is then:
```
{system_prompt}

## Session Context
{session_context}
```

Where `session_context` includes the session ID, current phase, completion flags, patient profile, health import summary, and (during intake) the collected answers so far.
