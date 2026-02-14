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
- All UI labels should be Title Case (use humanizeLabel from lib/statsApi for dynamic values)
- Drug names in chat output should link to DailyMed (`https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=DRUGNAME`)

## Running

Use `/restart` to start or restart both dev servers. This handles killing stale processes, cleaning lock files, and verifying health checks.

Manual commands if needed:
```bash
# Backend (port 8100) — no virtualenv, uses base conda env
cd /home/j/Documents/git/clinical-trial-copilot
pip install -e .
uvicorn backend.main:app --reload --port 8100

# Frontend (port 3000)
cd frontend
npm install
npm run dev
```

## Environment Variables
Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` (required)
- `OPENFDA_API_KEY` (optional, for higher rate limits)

## Demo / Testing
- Type `/test` as the first chat message to run the automated Ewing Sarcoma demo flow
- Type `/speedtest` for a faster single-message flow using multiple myeloma (medium-commonality condition)
- Always test frontend changes in Claude in Chrome before considering them complete

## Testing in Browser (MANDATORY)
Always test frontend changes in Claude in Chrome before considering them complete. This is a non-negotiable requirement — never skip browser verification. After making UI changes:
1. Ensure both dev servers are running (backend on 8100, frontend on 3000)
2. Open http://localhost:3000 in Claude in Chrome
3. Visually verify all changed components render correctly
4. Test interactive elements (clicks, animations, transitions)
5. Check the browser console for errors

## Context Overflow Protocol
If you run out of context in the middle of executing a plan, you MUST:
1. Clearly state to the user that context is running low and which tasks remain incomplete
2. Summarize what was completed and what was not
3. Offer to create a new plan scoped to the remaining (incomplete) tasks
4. Ensure the new plan includes testing and verification of ALL untested functionality from the original plan

## Plan File Management
Whenever you write a new plan file in `~/.claude/plans/`, create or update a symlink at `~/.claude/plans/latest-plan.md` pointing to it.
