# Clinical Trial Navigator — Project Instructions

## Overview
A conversational multi-agent system helping patients navigate ClinicalTrials.gov.
Built for the "Built with Opus 4.6" hackathon (Cerebral Valley x Anthropic, Feb 10-16 2026).

## Stack
- **Backend**: FastAPI (Python 3.11+) with Anthropic SDK for Claude API
- **Frontend**: Next.js 15 (React, TypeScript, Tailwind CSS, shadcn/ui)
- **AI**: Claude claude-opus-4-6 via Anthropic API with tool use for multi-agent orchestration
- **Data**: ClinicalTrials.gov API v2, openFDA API, Open-Meteo Geocoding

## Architecture
- Backend acts as orchestrator, using Claude's tool_use to call MCP-style tools
- Tools are Python functions in `backend/mcp_servers/` that wrap external APIs
- Agent "subagents" are implemented as separate Claude conversations with specialized system prompts
- Frontend connects via WebSocket for real-time chat streaming
- Session state stored as JSON files in `sessions/{session_id}/`

## Frontend Design
- Design system: @design-system/DESIGN-SYSTEM.md

## Key Conventions
- All patient-facing text must include medical disclaimer
- Never provide medical advice — frame as information for doctor discussions
- Eligibility scoring uses ✅/❌/❓/➖ indicators, never definitive statements
- Target 8th grade reading level for patient-facing content
- WCAG AA accessibility for all HTML output

## Running
```bash
# Backend
cd /home/j/Documents/git/clinical-trial-copilot
pip install -e .
uvicorn backend.main:app --reload --port 8100

# Frontend
cd frontend
npm install
npm run dev
```

## Environment Variables
Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` (required)
- `OPENFDA_API_KEY` (optional, for higher rate limits)
