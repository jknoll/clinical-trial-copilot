# Data Sources

Clinical Trial Navigator pulls from five external data sources. No single source provides everything a patient needs — ClinicalTrials.gov has trial records but no adverse-event data, openFDA has drug safety but no trial search, and AACT provides instant aggregate statistics that would be impractical to compute via API pagination. This document describes each source, why it was chosen, and how it integrates.

## ClinicalTrials.gov API v2

**What:** The U.S. National Library of Medicine's registry of 450,000+ clinical studies worldwide.

**Why:** The authoritative, free, real-time source for trial records. No account or API key required.

**Client library:** `aiohttp` (not `httpx` — ClinicalTrials.gov's TLS configuration rejects httpx connections; aiohttp works reliably).

**Implementation:** [`backend/mcp_servers/clinical_trials.py`](../backend/mcp_servers/clinical_trials.py)

**Endpoints used:**

| API Endpoint | Tool | Purpose |
|---|---|---|
| `GET /studies` | `search_trials` | Search by condition, intervention, phase, status, geographic coordinates + radius |
| `GET /studies/{nctId}` | `get_trial_details` | Full study record for a single trial |
| `GET /studies/{nctId}` (fields filter) | `get_eligibility_criteria` | Parsed inclusion/exclusion criteria |
| `GET /studies/{nctId}` (fields filter) | `get_trial_locations` | Recruiting site locations with coordinates |

**Key details:**
- Geographic filtering uses `filter.geo` with latitude, longitude, and distance in miles
- Results are paginated; the tool fetches up to 50 results per search
- Brief titles are truncated to 120 characters for context efficiency
- Interventions are capped at 3 per trial in search results
- Location results are limited to 10 per trial (5 shown in summaries)
- No authentication required; no explicit rate limit (but respectful pacing is expected)

## openFDA API

**What:** The U.S. FDA's public API for drug adverse events, labels, recalls, and device reports.

**Why:** Patients need to understand potential side effects of trial interventions. openFDA provides real-world adverse event reports and official drug label information that ClinicalTrials.gov does not include.

**Client library:** `httpx` (async)

**Implementation:** [`backend/mcp_servers/fda_data.py`](../backend/mcp_servers/fda_data.py)

**Endpoints used:**

| API Endpoint | Tool | Purpose |
|---|---|---|
| `GET /drug/event.json` | `get_adverse_events` | Most commonly reported adverse events for a drug (top 20 by default) |
| `GET /drug/label.json` | `get_drug_label` | FDA-approved label: indications, warnings, dosage, contraindications |

**Key details:**
- Optional `OPENFDA_API_KEY` for higher rate limits (240 vs 40 requests/minute)
- Drug names are searched generically (e.g., "pembrolizumab" not "Keytruda")
- Adverse event counts come from FAERS (FDA Adverse Event Reporting System)

## AACT PostgreSQL Database

**What:** The Aggregate Analysis of ClinicalTrials.gov (AACT) database, maintained by the Clinical Trials Transformation Initiative (CTTI). A nightly-refreshed PostgreSQL mirror of ClinicalTrials.gov with normalized, queryable tables.

**Why:** The stats panel needs instant faceted aggregations (phase distribution, sponsor counts, geographic breakdowns, enrollment histograms) across thousands of trials. Computing these via the ClinicalTrials.gov API would require paginating through all results and aggregating client-side — too slow for real-time UI updates. AACT provides direct SQL access for sub-second aggregate queries.

**Client library:** `asyncpg` (async PostgreSQL driver)

**Implementation:** [`backend/mcp_servers/aact_queries.py`](../backend/mcp_servers/aact_queries.py) (connection pool) + [`backend/api/stats.py`](../backend/api/stats.py) (30 REST endpoints)

**Connection pool:**
- Min 2, max 5 connections (stays under AACT's 10-per-account limit)
- 15-second command timeout per query
- Lazy-initialized on first request

**Key tables used:**

| Table | Data |
|---|---|
| `ctgov.studies` | Core study record: phase, status, enrollment, dates, sponsor |
| `ctgov.conditions` | Condition names linked to studies |
| `ctgov.facilities` | Trial site locations (name, city, state, country) |
| `ctgov.sponsors` | Lead and collaborating sponsors |
| `ctgov.interventions` | Drug, device, procedure, and other intervention types |
| `ctgov.eligibilities` | Age range, gender, eligibility criteria text |

**Key details:**
- Free account required at [aact.ctti-clinicaltrials.org](https://aact.ctti-clinicaltrials.org)
- AACT is used **only** for the stats panel — Claude's tools query ClinicalTrials.gov directly
- All queries use parameterized placeholders (`$1, $2, ...`) to prevent SQL injection
- Condition matching uses per-word `ILIKE` for flexible ordering (e.g., "ewing sarcoma" matches "Sarcoma, Ewing")
- `COUNT(DISTINCT s.nct_id)` prevents duplicate counts from multi-facility trials

## Open-Meteo Geocoding API

**What:** A free, open-source geocoding service that converts location names to coordinates and vice versa.

**Why:** Patients specify location as text ("San Francisco, CA" or "93436"). Trial search requires latitude/longitude for geographic filtering. Open-Meteo provides accurate forward geocoding with no API key, no rate limits, and no usage fees.

**Client library:** `httpx` (async)

**Implementation:** [`backend/mcp_servers/geocoding.py`](../backend/mcp_servers/geocoding.py)

**Capabilities:**

| Function | Tool | Purpose |
|---|---|---|
| Forward geocoding | `geocode_location` | Convert location string → latitude/longitude |
| Reverse geocoding | (stats API) | Convert coordinates → place name (for browser geolocation) |
| Distance calculation | `calculate_distance` | Haversine distance between two coordinate pairs |

**Key details:**
- No authentication required
- Forward geocoding returns top result by population match
- Distance calculation uses the Haversine formula (great-circle distance on a sphere)
- Used both by Claude's tools (for trial search) and the stats API (for browser location display)

## Apple Health

**What:** Apple Health data exported from an iPhone as a ZIP file containing `export.xml` and optional FHIR JSON clinical records.

**Why:** Patients often have objective health data (lab results, vitals, medications, activity levels) that can improve eligibility scoring. Rather than asking patients to recall exact lab values, the system can import their Apple Health export and extract relevant measurements automatically.

**Implementation:** [`backend/mcp_servers/apple_health.py`](../backend/mcp_servers/apple_health.py)

**Data extracted:**

| Category | Examples | Used For |
|---|---|---|
| Lab results | Hemoglobin, creatinine, WBC, platelets, ALT/AST | Eligibility criteria (organ function requirements) |
| Vitals | Heart rate, blood pressure, weight, BMI, SpO2 | General health assessment |
| Medications | Active prescriptions with dosage | Drug interaction and washout period checks |
| Activity | Step counts (daily averages over 30/90 days) | ECOG performance status estimation |

**ECOG estimation from steps:**

| Daily Step Average | Estimated ECOG | Interpretation |
|---|---|---|
| >= 7,500 | 0 | Fully active |
| >= 4,000 | 1 | Restricted in strenuous activity |
| >= 1,000 | 2 | Ambulatory, capable of self-care |
| >= 250 | 3 | Limited self-care |
| < 250 | 4 | Completely disabled |

**Key details:**
- Accepts ZIP files (standard Apple Health export format) or raw XML
- Also supports direct JSON POST for FHIR-formatted clinical data
- Lab values are extracted with timestamps; most recent values are used
- ECOG estimation is clearly labeled as an estimate — never presented as a clinical assessment
- The `get_health_import_summary` tool makes imported data available to Claude during eligibility analysis

---

## Data Flow Summary

```
Patient Chat Input
       │
       ▼
┌──────────────┐    search/details/    ┌──────────────────────┐
│   Claude      │───eligibility/────►  │  ClinicalTrials.gov  │
│  Orchestrator │   locations          │  API v2 (aiohttp)    │
│  (17 tools)   │                      └──────────────────────┘
│               │    adverse events/   ┌──────────────────────┐
│               │───drug labels────►   │  openFDA API (httpx) │
│               │                      └──────────────────────┘
│               │    geocoding/        ┌──────────────────────┐
│               │───distance───────►   │  Open-Meteo (httpx)  │
│               │                      └──────────────────────┘
│               │    health summary    ┌──────────────────────┐
│               │◄─────────────────    │  Apple Health Import │
│               │                      │  (file upload)       │
└──────────────┘                       └──────────────────────┘

Stats Panel (independent)
       │
       ▼                               ┌──────────────────────┐
  30 REST endpoints ──── SQL ────────► │  AACT PostgreSQL     │
  (FastAPI + asyncpg)                  │  (nightly mirror)    │
                                       └──────────────────────┘
```
