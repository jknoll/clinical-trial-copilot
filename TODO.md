# TODO

## Phase 1: Foundation (Day 1)
- [ ] Project scaffolding and configuration
- [ ] MCP servers (clinical_trials, geocoding, fda_data)
- [ ] Pydantic models (patient, trial, session)
- [ ] FastAPI app with health check
- [ ] Session management
- [ ] Frontend scaffold (Next.js + Tailwind)
- [ ] Verify MCP servers against live APIs

## Phase 2: Core Agents + Chat Flow (Day 2)
- [ ] Agent system prompts (orchestrator, intake, search, match_translate, report_generator)
- [ ] Agent orchestration with Claude API
- [ ] WebSocket handler for chat streaming
- [ ] Frontend chat interface with message streaming
- [ ] Intake → Search flow end-to-end
- [ ] IntakeWidget and TrialCard components

## Phase 3: Intelligence Layer (Day 3)
- [ ] Match & Translate agent with eligibility scoring
- [ ] TrialSelector component
- [ ] ComparisonTable component
- [ ] End-to-end intake → search → match → select flow

## Phase 4: Report + Visualizations (Day 4)
- [ ] Report HTML template (Jinja2)
- [ ] Report generator
- [ ] TrialMap (Leaflet)
- [ ] DemographicChart (Recharts)
- [ ] PhasePipeline chart
- [ ] Deep dive support
- [ ] ReportViewer component

## Phase 5: Polish + Demo (Day 5)
- [ ] Demo profile and script
- [ ] Test with 3+ diverse conditions
- [ ] Error handling and edge cases
- [ ] README.md for submission
- [ ] Demo video
