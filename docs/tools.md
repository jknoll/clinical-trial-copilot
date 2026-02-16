# Tool Reference

The orchestrator exposes 17 tools to Claude via the Anthropic tool_use API. Each tool is an async Python function with a JSON Schema definition in [`backend/agents/orchestrator.py`](../backend/agents/orchestrator.py).

### MCP-Style Architecture

The tool implementations live in `backend/mcp_servers/` and follow the naming convention of the Model Context Protocol (MCP), but they are **not true MCP servers** — they're in-process function calls invoked directly by the orchestrator. This was chosen for simplicity in a monolith deployment: no inter-process communication, no serialization overhead, and a single Python process to debug. However, the module structure (`mcp_servers/clinical_trials.py`, `mcp_servers/fda_data.py`, etc.) is organized so that these tools could be extracted into standalone MCP servers if the architecture needed to scale beyond a single process.

Each tool module wraps one external API (or internal capability) and exposes async functions that the orchestrator calls when Claude requests a `tool_use`. Tool schemas are defined in the orchestrator as Anthropic-format JSON, and tool dispatch is a simple name → function mapping.

For how tools are executed at runtime (heartbeats, truncation, the agentic loop), see [Architecture](architecture.md). For which external APIs each tool calls, see [Data Sources](data-sources.md).

---

## Clinical Trials (4 tools)

These tools query the ClinicalTrials.gov API v2 via `aiohttp`. See [Data Sources — ClinicalTrials.gov](data-sources.md#clinicaltrialsgov-api-v2) for why aiohttp is used instead of httpx.

**Implementation:** [`backend/mcp_servers/clinical_trials.py`](../backend/mcp_servers/clinical_trials.py)

### `search_trials`

Search ClinicalTrials.gov for trials matching the patient's criteria.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `condition` | string | yes | — | Medical condition (e.g., "non-small cell lung cancer") |
| `intervention` | string | no | — | Specific treatment to filter by |
| `phase` | string[] | no | — | `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4` |
| `status` | string[] | no | `["RECRUITING"]` | Trial statuses to include |
| `latitude` | number | no | — | Patient latitude for geographic filtering |
| `longitude` | number | no | — | Patient longitude for geographic filtering |
| `distance_miles` | integer | no | 100 | Max distance from patient in miles |
| `max_results` | integer | no | 50 | Maximum results to return |

**Returns:** Array of trial summaries (NCT ID, title, phase, status, interventions, sponsor, enrollment, location).

**Post-search validation:** Results are filtered by `_condition_matches()`, which checks that every significant word (3+ characters) from the `condition` query appears in each trial's `conditions` list. This prevents ClinicalTrials.gov's fuzzy `query.cond` matching from returning irrelevant trials (e.g., searching "Ewing Sarcoma" no longer returns osteosarcoma or rhabdomyosarcoma trials). Trials with empty conditions lists are preserved (benefit of the doubt).

### `get_trial_details`

Get the complete study record for a specific trial.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `nct_id` | string | yes | NCT identifier (e.g., "NCT12345678") |

**Returns:** Full study record including description, design, arms, outcomes, contacts.

### `get_eligibility_criteria`

Get parsed inclusion and exclusion criteria for a trial.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `nct_id` | string | yes | NCT identifier |

**Returns:** Structured inclusion/exclusion lists with age range and gender requirements.

### `get_trial_locations`

Get recruiting site locations with coordinates and contact info.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `nct_id` | string | yes | NCT identifier |

**Returns:** Up to 10 locations with facility name, address, coordinates, contact phone/email.

---

## Geocoding (2 tools)

Convert between location names and coordinates, and calculate distances. Uses the Open-Meteo Geocoding API.

**Implementation:** [`backend/mcp_servers/geocoding.py`](../backend/mcp_servers/geocoding.py)

### `geocode_location`

Convert a location name to latitude/longitude coordinates.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `location_string` | string | yes | Location to geocode (e.g., "Lompoc, CA" or "93436") |

**Returns:** Latitude, longitude, and resolved location name.

### `calculate_distance`

Calculate the distance in miles between two geographic points using the Haversine formula.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat1` | number | yes | First point latitude |
| `lon1` | number | yes | First point longitude |
| `lat2` | number | yes | Second point latitude |
| `lon2` | number | yes | Second point longitude |

**Returns:** Distance in miles.

---

## FDA (2 tools)

Query the openFDA API for drug safety and label data.

**Implementation:** [`backend/mcp_servers/fda_data.py`](../backend/mcp_servers/fda_data.py)

### `get_adverse_events`

Get the most commonly reported adverse events for a drug.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `drug_name` | string | yes | — | Generic drug name (e.g., "pembrolizumab") |
| `limit` | integer | no | 20 | Max adverse events to return |

**Returns:** Ranked list of adverse event terms with report counts from FAERS.

### `get_drug_label`

Get FDA-approved drug label information.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `drug_name` | string | yes | Generic drug name |

**Returns:** Indications, warnings, dosage, contraindications from the approved label.

---

## Session and Profile (2 tools)

Manage patient data and session state. These are internal to the orchestrator — they read/write session JSON files rather than calling external APIs.

### `save_patient_profile`

Save or update the patient profile with information gathered during intake. Called after collecting patient information across the interview.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `profile` | object | yes | Nested profile object (see below) |

**Profile structure:**
- `condition` — primary diagnosis, stage, subtype, biomarkers, date of diagnosis
- `treatment_history[]` — past treatments with type, cycles, response, end date
- `demographics` — age, sex, estimated ECOG score
- `location` — description, coordinates, max travel miles, open to virtual
- `preferences` — trial types, phases, placebo acceptability, intervention interests

**Returns:** Confirmation with saved profile summary.

### `update_session_phase`

Transition the session to a new phase.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `phase` | enum | yes | One of: `intake`, `search`, `matching`, `selection`, `report`, `followup` |

**Returns:** Confirmation of phase transition. Triggers system prompt rebuild on next API call.

---

## UI Emission (4 tools)

Push structured data to the frontend via WebSocket. These tools don't return meaningful data to Claude — their purpose is to trigger UI updates in the browser.

### `emit_widget`

Send a structured selection widget for patient input (multi-choice questions during intake).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `question` | string | yes | Question to display |
| `widget_type` | enum | yes | `single_select` or `multi_select` |
| `options` | object[] | yes | Each: `label`, `value`, optional `description` |

**Frontend rendering:** `IntakeWidget` component with styled option buttons.

### `emit_trial_cards`

Send trial summary cards for review or selection.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `trials` | object[] | yes | Each: NCT ID, title, phase, status, fit score, summary, distance, interventions, sponsor, coordinates |
| `selectable` | boolean | no | Whether user can select trials from this list |

**Frontend rendering:** `TrialCard` components with fit-score badges, `TrialMap` with location pins.

### `emit_status`

Send a progress status message (e.g., "Searching ClinicalTrials.gov...").

| Parameter | Type | Required | Description |
|---|---|---|---|
| `phase` | string | yes | Current phase identifier |
| `message` | string | yes | Human-readable status message |

**Frontend rendering:** Inline status with `Loader2` spinner icon.

### `emit_partial_filters`

Emit incremental filter updates to the stats panel as information is gathered during intake. Called after each patient answer that provides filter-relevant data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `condition` | string | no | Patient's primary condition |
| `age` | integer | no | Patient's age |
| `sex` | string | no | Biological sex |
| `location` | string | no | Location description |
| `latitude` | number | no | Location latitude |
| `longitude` | number | no | Location longitude |
| `distance_miles` | integer | no | Max travel distance |
| `statuses` | string[] | no | Trial statuses to filter by |
| `phases` | string[] | no | Trial phases to filter by |

**Frontend rendering:** `StatsPanel` updates charts and counts in real time as filters accumulate.

---

## Analysis and Report (3 tools)

Save analysis results and generate the final patient report.

### `save_matched_trials`

Save scored and ranked trial matches after eligibility analysis. Claude populates all fields for a complete report.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `trials` | object[] | yes | Array of matched trials (see below) |

**Per-trial fields:**
- `nct_id`, `brief_title`, `phase`, `overall_status`, `interventions`, `sponsor`, `enrollment_count`, `start_date`
- `fit_score` — Integer 0–100 (not a decimal; values 0–1 are auto-multiplied by 100)
- `fit_summary` — One-sentence fit explanation
- `plain_language_summary` — 8th-grade reading level description of the trial
- `what_to_expect` — Visit frequency, procedures, duration
- `inclusion_scores[]` — Each criterion with status (`met` / `not_met` / `needs_discussion` / `not_enough_info`), icon, explanation, plain language translation
- `exclusion_scores[]` — Same structure (icon meanings differ: `met` = patient does NOT have the exclusion)
- `nearest_location` — Facility, city, state, country, distance, contact info, coordinates
- `adverse_events[]` — Common side effects for the trial's interventions

**Returns:** Confirmation with trial count.

### `generate_report`

Generate the final HTML report for the patient. Called during the report phase after all trials have been analyzed and the patient has selected trials.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `questions_for_doctor` | string[] | no | Personalized questions for the patient to ask |
| `glossary` | object | no | Medical terms → plain language definitions |

**Returns:** Confirmation that the report is ready. Triggers `report_ready` WebSocket event.

**Implementation:** [`backend/report/generator.py`](../backend/report/generator.py) (Jinja2 HTML) + [`backend/report/pdf_generator.py`](../backend/report/pdf_generator.py) (Playwright PDF).

### `get_health_import_summary`

Get a summary of the patient's imported Apple Health data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| (none) | — | — | No parameters |

**Returns:** Lab results, vitals, medications, activity levels, and estimated ECOG score — or `null` if no health data has been imported.

---

## Tool Execution Summary

| Category | Count | External API | Implementation Module |
|---|---|---|---|
| Clinical Trials | 4 | ClinicalTrials.gov v2 | [`mcp_servers/clinical_trials.py`](../backend/mcp_servers/clinical_trials.py) |
| Geocoding | 2 | Open-Meteo | [`mcp_servers/geocoding.py`](../backend/mcp_servers/geocoding.py) |
| FDA | 2 | openFDA | [`mcp_servers/fda_data.py`](../backend/mcp_servers/fda_data.py) |
| Session & Profile | 2 | (internal) | [`agents/orchestrator.py`](../backend/agents/orchestrator.py) |
| UI Emission | 4 | (WebSocket push) | [`agents/orchestrator.py`](../backend/agents/orchestrator.py) |
| Analysis & Report | 3 | (internal + Apple Health) | [`agents/orchestrator.py`](../backend/agents/orchestrator.py), [`mcp_servers/apple_health.py`](../backend/mcp_servers/apple_health.py) |
| **Total** | **17** | | |

All `mcp_servers/*` modules follow the MCP naming convention but run in-process. See [MCP-Style Architecture](#mcp-style-architecture) above for rationale.
