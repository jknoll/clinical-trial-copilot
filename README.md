# Clinical Trial Navigator

**AI-powered clinical trial guidance for patients and caregivers.**

Clinical Trial Navigator transforms the overwhelming experience of searching 450,000+ trials on ClinicalTrials.gov into a personalized, conversational journey. Powered by Claude Opus 4.6, it conducts empathetic patient interviews, searches real clinical trial data, translates dense medical eligibility criteria into plain language, and generates accessible briefing reports for doctor visits.

Built for the **"Built with Opus 4.6" Hackathon** (Cerebral Valley x Anthropic, Feb 2026).

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────────────┐
│   Next.js 16    │◄──────────────────►│     FastAPI Backend      │
│   React + TS    │    streaming chat   │                         │
│   Tailwind CSS  │                     │  Agent Orchestrator     │
│   Leaflet Maps  │                     │  (Claude Opus 4.6)      │
│   Recharts      │                     │                         │
└─────────────────┘                     │  ┌─ ClinicalTrials.gov  │
                                        │  ├─ openFDA API         │
                                        │  └─ Open-Meteo Geocoding│
                                        └─────────────────────────┘
```

**Key technologies:**
- **Claude Opus 4.6** with streaming tool use — 15 tools across 3 MCP-style API servers
- **Multi-phase agent architecture** — Intake → Search → Matching → Selection → Report → Follow-up
- **ClinicalTrials.gov API v2** — Real-time search with geographic filtering and pagination
- **openFDA API** — Adverse event data and drug labels
- **WCAG AA accessible** HTML + PDF report generation (Jinja2 + Playwright)
- **Tested with diverse conditions** — NSCLC, Type 2 Diabetes, Ewing Sarcoma (rare disease)

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd clinical-trial-copilot

# Backend
pip install -e .
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
uvicorn backend.main:app --host 0.0.0.0 --port 8100 --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and start chatting.

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

## How It Works

1. **Intake** — Claude conducts an empathetic interview, gathering condition, treatment history, location, demographics, and preferences one question at a time.
2. **Search** — Multiple search strategies query ClinicalTrials.gov in real-time, with geographic filtering and deduplication.
3. **Matching** — Each trial's eligibility criteria are evaluated against the patient profile, scored, and translated to 8th-grade reading level.
4. **Selection** — Patients review ranked trials with fit scores and select ones to explore further.
5. **Report** — A comprehensive, printable HTML/PDF report is generated with trial summaries, eligibility checklists, comparison tables, questions for the doctor, and a glossary.

## Safety

- Never provides medical advice or treatment recommendations
- All guidance framed as information for discussion with healthcare providers
- Human-in-the-loop confirmation at every major decision point
- Medical disclaimer presented at session start

## Project Structure

```
backend/
  agents/orchestrator.py    — Claude agent with 15 tools, streaming agentic loop
  agents/prompts/           — Phase-specific system prompts
  agents/skills/            — Medical translation and eligibility analysis
  mcp_servers/              — ClinicalTrials.gov, openFDA, geocoding API wrappers
  models/                   — Pydantic models (patient, trial, session)
  report/                   — Jinja2 HTML + Playwright PDF report generator
  main.py                   — FastAPI app
  websocket.py              — WebSocket chat handler

frontend/
  components/               — React components (10 total)
  lib/                      — WebSocket client, TypeScript types
  app/                      — Next.js app router pages
```

## Testing

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

26 tests cover 3 diverse conditions (NSCLC, Type 2 Diabetes, Ewing Sarcoma) against live APIs.

## Requirements

- Python 3.11+
- Node.js 18+
- Anthropic API key (Claude Opus 4.6)
- Playwright + Chromium (for PDF export): `playwright install chromium`
