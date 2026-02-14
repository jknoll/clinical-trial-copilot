# Clinical Trial Navigator

**AI-powered clinical trial guidance for patients and caregivers.**

Clinical Trial Navigator transforms the overwhelming experience of searching 450,000+ trials on ClinicalTrials.gov into a personalized, conversational journey. Powered by Claude Opus 4.6, it conducts empathetic patient interviews, searches real clinical trial data, translates dense medical eligibility criteria into plain language, and generates accessible briefing reports for doctor visits.

Built for the **"Built with Opus 4.6" Hackathon** (Cerebral Valley x Anthropic, Feb 2026).

## Why This Exists

ClinicalTrials.gov contains over 450,000 studies, but it was designed for researchers, not patients. Eligibility criteria are written in dense medical language ("ECOG performance status 0-1", "adequate hepatic function as defined by..."), search results are unranked, and there's no way to understand which trials might actually be a good fit without clinical expertise.

Clinical Trial Navigator bridges that gap with a conversational AI that:
- **Interviews** the patient in plain language, one question at a time
- **Searches** across multiple strategies (exact match, broader category, geographic expansion)
- **Scores** eligibility criteria on four levels (met, not met, needs discussion, not enough info)
- **Translates** medical jargon to 8th-grade reading level
- **Generates** a printable report for the patient's next doctor visit

It does not provide medical advice. It provides information to help patients have better conversations with their doctors.

## Architecture

```
┌──────────────────────────┐           ┌─────────────────────────────────────┐
│    Frontend (Next.js 16) │           │       Backend (FastAPI)             │
│                          │           │                                     │
│  35 React components     │ WebSocket │  Agent Orchestrator (Claude Opus)   │
│  18 chart types          │◄────────►│  17 tools · 6 phase prompts         │
│  Leaflet maps            │ streaming │                                     │
│  Recharts visualizations │   chat    │  ┌─ ClinicalTrials.gov (aiohttp)   │
│                          │           │  ├─ openFDA (httpx)                 │
│  Stats panel (real-time) │◄── REST ─►│  ├─ Open-Meteo Geocoding (httpx)   │
│  30 endpoints            │  stats    │  ├─ AACT PostgreSQL (asyncpg)       │
│                          │           │  └─ Apple Health (file import)      │
└──────────────────────────┘           │                                     │
                                       │  Session Manager (JSON files)       │
                                       │  Report Generator (Jinja2 + PDF)    │
                                       └─────────────────────────────────────┘
```

## Key Features

- **Conversational intake** with structured selection widgets — gathers condition, treatment history, demographics, location, and preferences
- **Multi-strategy trial search** with geographic filtering, deduplication, and automatic broadening for rare diseases
- **4-level eligibility scoring** — each criterion scored as met, not met, needs discussion, or not enough info
- **Plain-language translation** — all medical jargon rewritten at 8th-grade reading level
- **Real-time stats panel** — 18 chart types powered by 30 REST endpoints querying AACT PostgreSQL
- **Interactive trial maps** — Leaflet maps showing trial site locations with distance from patient
- **Apple Health import** — extracts labs, vitals, medications, and activity data; estimates ECOG from step counts
- **WCAG AA accessible reports** — HTML + PDF with eligibility checklists, comparison tables, doctor questions, and glossary
- **WebSocket streaming** — real-time chat with progress status updates during long operations
- **Drug safety links** — drug names linked to DailyMed for FDA label information

## How It Works

The system progresses through six phases, each with a specialized Claude prompt. See [Agents and Phases](docs/agents-and-phases.md) for full details.

| Phase | What Happens | Key Tools |
|---|---|---|
| **1. Intake** | Empathetic patient interview, one question at a time. Widgets for structured choices. Stats panel updates in real time as answers are collected. | `emit_widget`, `emit_partial_filters`, `geocode_location`, `save_patient_profile` |
| **2. Search** | Up to 5 search strategies against ClinicalTrials.gov — exact match, broader category, intervention-specific, geographic expansion, phase-specific. Deduplication by NCT ID. | `search_trials`, `emit_status` |
| **3. Matching** | Each trial's eligibility criteria evaluated against the patient profile. 4-level scoring, plain-language translation, adverse event lookup, "what to expect" sections. | `get_eligibility_criteria`, `get_adverse_events`, `get_trial_locations`, `save_matched_trials` |
| **4. Selection** | Human-in-the-loop checkpoint. Patient reviews ranked trial cards with fit scores and selects which to include in their report. | `emit_trial_cards` |
| **5. Report** | Comprehensive HTML report generated with Jinja2. Includes executive summary, eligibility checklists, comparison table, doctor questions, glossary. Optional PDF via Playwright. | `generate_report` |
| **6. Follow-up** | Open-ended conversation. Patient can ask questions, request changes, or explore additional trials. | All tools available |

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd clinical-trial-copilot

# Backend (Python 3.11+)
pip install -e .
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
uvicorn backend.main:app --host 0.0.0.0 --port 8100 --reload

# Frontend (new terminal, Node.js 18+)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and start chatting.

### Demo Commands

Type these as the first chat message to run automated demo flows:

- **`/test`** — Full Ewing Sarcoma demo (rare disease, exercises all phases)
- **`/speedtest`** — Faster single-message flow using multiple myeloma

### Optional: PDF Export

```bash
playwright install chromium
```

### Optional: AACT Stats Database

The stats panel requires a free AACT account for real-time aggregate statistics:

1. Register at [aact.ctti-clinicaltrials.org](https://aact.ctti-clinicaltrials.org)
2. Add to `.env`: `AACT_DATABASE_URL=postgresql://username:password@aact-db.ctti-clinicaltrials.org:5432/aact`

The chat and report features work without AACT — only the stats panel requires it.

### Docker

```bash
docker compose up --build
```

### Deploy to Fly.io

```bash
fly launch  # first time
fly deploy   # subsequent deploys
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | — | Claude API key |
| `AACT_DATABASE_URL` | no | — | PostgreSQL connection string for AACT stats database |
| `OPENFDA_API_KEY` | no | — | Higher rate limits for openFDA (240 vs 40 req/min) |
| `FRONTEND_URL` | no | — | Production frontend URL for CORS |
| `HOST` | no | `0.0.0.0` | Backend bind address |
| `PORT` | no | `8100` | Backend port |
| `LOG_LEVEL` | no | `info` | Logging level |
| `NEXT_PUBLIC_WS_URL` | no | `ws://localhost:8100/ws` | WebSocket URL for frontend |
| `NEXT_PUBLIC_API_URL` | no | `http://localhost:8100` | REST API URL for frontend |

## Project Structure

```
backend/
  agents/
    orchestrator.py             — Claude agent with 17 tools, streaming agentic loop
    prompts/                    — 6 phase-specific system prompts
      orchestrator.md             Base prompt (always loaded)
      intake.md                   Patient interview
      search.md                   Trial search strategies
      match_translate.md          Eligibility scoring + translation
      selection.md                Human-in-the-loop trial selection
      report_generator.md         Report generation + follow-up
    skills/                     — 2 reusable skill prompts
      eligibility_analysis.md     Scoring rules for criteria types
      medical_translation.md      Plain-language translation rules
  mcp_servers/                  — 5 API wrapper modules
    clinical_trials.py            ClinicalTrials.gov v2 (aiohttp)
    fda_data.py                   openFDA adverse events + labels (httpx)
    geocoding.py                  Open-Meteo geocoding + Haversine (httpx)
    aact_queries.py               AACT PostgreSQL connection pool (asyncpg)
    apple_health.py               Apple Health XML/FHIR parser
  models/                       — 3 Pydantic model files
    patient.py                    PatientProfile, HealthKitImport, labs, vitals
    session.py                    SessionState, phase tracking, flags
    trial.py                      TrialSummary, MatchedTrial, eligibility scores
  api/
    stats.py                    — 30 REST endpoints for stats panel
  report/
    generator.py                — Jinja2 HTML report generation
    pdf_generator.py            — Playwright PDF export
    templates/report.html       — Report HTML template
  main.py                       — FastAPI app, REST routes, startup/shutdown
  websocket.py                  — WebSocket handler, message routing
  session.py                    — File-based session manager

frontend/
  components/                   — 17 UI components
    Chat.tsx                      Main chat interface
    MessageBubble.tsx             Chat message rendering
    IntakeWidget.tsx              Structured selection widgets
    TrialCard.tsx                 Trial summary card
    TrialSelector.tsx             Trial selection with fit scores
    TrialCarousel.tsx             Horizontal trial browsing
    TrialMap.tsx / TrialMapInner  Leaflet map for trial locations
    ComparisonTable.tsx           Side-by-side trial comparison
    StatsPanel.tsx                Real-time statistics dashboard
    ReportViewer.tsx              HTML report display
    HealthImport.tsx              Apple Health file upload
    AgentActivity.tsx             Agent phase activity indicator
    PhasePipeline.tsx             Phase progress visualization
    QueryEditor.tsx               SQL query viewer/editor
    SessionQR.tsx                 QR code for session sharing
    SplitHandle.tsx               Resizable panel divider
  components/charts/            — 18 chart components (Recharts + Leaflet)
    PhaseDonut.tsx                Phase distribution donut
    StatusBar.tsx                 Trial status horizontal bars
    DiseaseBar.tsx                Top conditions bar chart
    SponsorBar.tsx                Top sponsors bar chart
    GenderChart.tsx               Gender eligibility donut
    AgeGroupChart.tsx             Age group distribution
    InterventionTypeChart.tsx     Intervention type breakdown
    DurationChart.tsx             Study duration distribution
    StartYearChart.tsx            Trial start year timeline
    FacilityCountChart.tsx        Facility count histogram
    CountryChart.tsx              Country distribution
    FunnelChart.tsx               Search funnel visualization
    EnrollmentHistogram.tsx       Enrollment size distribution
    CompletionRateChart.tsx       Completion vs termination
    FunderTypeChart.tsx           Funder type breakdown
    StudyTypeChart.tsx            Study type distribution
    StatsMap.tsx / StatsMapInner  Geographic stats map (Leaflet)
  lib/                          — 5 utility modules
    websocket.ts                  WebSocket client with reconnection
    types.ts                      TypeScript interfaces
    statsApi.ts                   Stats REST client + humanizeLabel
    chartPalette.ts               Chart color constants
    geolocation.ts                Browser geolocation helpers
  app/
    page.tsx                    — Main app entry (session, layout, state)
    layout.tsx                  — Root layout (fonts, metadata)
    globals.css                 — Tailwind + custom styles
```

## Design Decisions

| Decision | Rationale |
|---|---|
| **FastAPI** over Django/Flask | Async-first for WebSocket streaming + concurrent tool execution |
| **Single orchestrator** vs multi-process agents | Simpler state management, shared context, lower latency. Phase-specific prompts provide specialization without the complexity of inter-agent communication. |
| **aiohttp** for ClinicalTrials.gov | httpx is TLS-blocked by ClinicalTrials.gov's server; aiohttp works reliably |
| **JSON file sessions** vs database | Zero setup, human-readable, sufficient for demo. Each session is a directory of JSON files. |
| **AACT for stats** vs API pagination | ClinicalTrials.gov API would require paginating all results and aggregating client-side. AACT provides sub-second SQL aggregations. |
| **WebSocket** over SSE | Bidirectional — frontend sends widget responses, trial selections, and system hints back to the server |
| **Recharts** over D3/Chart.js | React-native (no DOM manipulation), lightweight, good TypeScript support |
| **No Redux** — React hooks | Component state + props sufficient for this app. No global state management needed. |
| **MCP-style** not true MCP | Tools are async functions in the same process. True MCP would add complexity (separate servers, IPC) without benefit for a monolith. |
| **Playwright** for PDF | Renders the same HTML report template, ensuring visual consistency between browser and PDF |

## Safety and Ethics

Clinical Trial Navigator is an information tool, not a medical device.

- **Never provides medical advice** — all guidance framed as information for discussion with healthcare providers
- **4-level eligibility scoring** — criteria are scored as met, not met, needs discussion, or not enough info. Never makes definitive eligibility statements.
- **8th-grade reading level** — all patient-facing text is written to be accessible
- **Human-in-the-loop** — the patient must explicitly select which trials to include in their report
- **Medical disclaimer** — presented at session start and included in every report
- **WCAG AA accessibility** — all HTML output meets accessibility standards
- **Drug safety linking** — drug names link to DailyMed for official FDA label information
- **No data persistence beyond session** — patient data is stored only in session JSON files, not in any external database

## Testing and Demo

### Automated Demo Flows

| Command | Condition | Coverage |
|---|---|---|
| `/test` | Ewing Sarcoma (rare) | Full 6-phase flow with all tools |
| `/speedtest` | Multiple Myeloma | Faster single-message flow |

### Unit Tests

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

26 tests cover 3 diverse conditions (NSCLC, Type 2 Diabetes, Ewing Sarcoma) against live APIs.

## Requirements

- Python 3.11+
- Node.js 18+
- Anthropic API key (Claude Opus 4.6)
- Playwright + Chromium (optional, for PDF export): `playwright install chromium`
- AACT account (optional, for stats panel): [aact.ctti-clinicaltrials.org](https://aact.ctti-clinicaltrials.org)

## Further Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System overview, orchestrator loop, WebSocket protocol, session management, context engineering |
| [Tools](docs/tools.md) | Complete reference for all 17 tools with parameters, return formats, and implementation modules |
| [Agents and Phases](docs/agents-and-phases.md) | The 6-phase system — prompt loading, phase transitions, and per-phase behavior |
| [Data Sources](docs/data-sources.md) | All 5 external data sources — why each was chosen, how it integrates, client libraries used |

---

Built with Claude Opus 4.6 at the Cerebral Valley x Anthropic Hackathon, February 2026.
