# Completed Tasks

## Phase 1: Foundation
- [x] Initialize git repo
- [x] Create spec.md and hackathon-details.md
- [x] Project scaffolding: pyproject.toml, .gitignore, .env.example, CLAUDE.md
- [x] MCP servers: clinical_trials.py (aiohttp), geocoding.py (httpx), fda_data.py (httpx)
- [x] Pydantic models: patient.py, trial.py, session.py
- [x] FastAPI app with CORS, health check, session CRUD, report endpoint
- [x] File-based session manager (create/read/write JSON)
- [x] Frontend scaffold: Next.js 16 + TypeScript + Tailwind CSS
- [x] Chat.tsx, MessageBubble.tsx, IntakeWidget.tsx, TrialCard.tsx
- [x] WebSocket client (lib/websocket.ts) and types (lib/types.ts)
- [x] Verified all MCP servers against live APIs

## Phase 2: Core Agents + Chat Flow
- [x] Agent system prompts (orchestrator, intake, search, match_translate, report_generator)
- [x] Skills files (medical_translation.md, eligibility_analysis.md)
- [x] Agent orchestrator with 15 tools and streaming agentic loop
- [x] WebSocket handler with session-scoped orchestrators
- [x] End-to-end WebSocket chat flow: message → Claude → tools → streaming response
- [x] Fixed ClinicalTrials.gov phase filter (filter.advanced instead of filter.phase)
- [x] Fixed data model mismatches (clinical_trials.py → TrialSummary)

## Phase 3: Intelligence Layer
- [x] save_matched_trials tool added to orchestrator
- [x] generate_report tool added to orchestrator
- [x] TrialSelector.tsx with ranked selection and fit score bars
- [x] ComparisonTable.tsx with sortable columns

## Phase 4: Report + Visualizations
- [x] Report HTML template (Jinja2) with WCAG AA accessibility
- [x] Report generator with default glossary and doctor questions
- [x] TrialMap.tsx + TrialMapInner.tsx (Leaflet with dynamic import)
- [x] PhasePipeline.tsx (Recharts bar chart)
- [x] ReportViewer.tsx with download and print
- [x] Demo profile (demo/demo_profile.json)

## Phase 5: Polish + Demo
- [x] Demo script
- [x] README.md for submission
- [x] Frontend builds cleanly (TypeScript passes)
