# Architecture

This document covers the technical architecture of Clinical Trial Navigator — the runtime mechanics that make the agent system work. For the phase-specific behavior and prompt design, see [Agents and Phases](agents-and-phases.md). For the complete tool reference, see [Tools](tools.md). For external API details, see [Data Sources](data-sources.md).

---

## System Overview

Clinical Trial Navigator is a three-tier application with two communication channels:

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                 │
│  35 React components  ·  18 chart types  ·  Leaflet maps │
│  Real-time WebSocket client  ·  REST stats client        │
└──────────┬───────────────────────────────┬───────────────┘
           │ WebSocket (chat + UI events)  │ REST (stats)
           ▼                               ▼
┌──────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                        │
│                                                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Orchestrator    │  │  Stats API   │  │  Session     │ │
│  │  (Claude Opus)   │  │  (30 endpts) │  │  Manager     │ │
│  │  17 tools        │  │  asyncpg     │  │  JSON files  │ │
│  └────────┬────────┘  └──────┬───────┘  └──────┬──────┘ │
│           │                  │                  │         │
└───────────┼──────────────────┼──────────────────┼────────┘
            │                  │                  │
            ▼                  ▼                  ▼
   ClinicalTrials.gov    AACT PostgreSQL    sessions/{id}/
   openFDA               (nightly mirror)   state.json
   Open-Meteo                               patient_profile.json
   Apple Health (file)                      matched_trials.json
```

**Two communication channels:**
- **WebSocket** (`/ws/{session_id}`) — Bidirectional streaming for chat, widgets, trial cards, status updates, and report notifications
- **REST** (`/api/stats/*`) — 30 endpoints for the stats panel, querying AACT directly (bypasses Claude entirely)

---

## Orchestrator Loop

The core agentic loop lives in `AgentOrchestrator.process_message()`. It streams Claude's response, executes any tool calls, feeds results back, and repeats until Claude stops requesting tools.

```
User message
    │
    ▼
┌─► Stream Claude response (max_tokens=16384)
│       │
│       ├─ Collect text chunks → emit to WebSocket
│       └─ Collect tool_use blocks
│               │
│               ▼
│       Execute each tool (with heartbeat for long ops)
│               │
│               ▼
│       Append tool_results to conversation history
│               │
│               ▼
│       stop_reason == "tool_use"? ─── yes ──► loop back ─┐
│               │                                          │
│               no                                         │
│               │                                          │
│               ▼                                          │
│       Emit pending UI events + "done"                    │
│                                                          │
└──────────────────────────────────────────────────────────┘

Max iterations: 15 (safety limit to prevent infinite loops)
```

**Key parameters:**
- **Model:** Configurable via `settings.model` (default: `claude-opus-4-6`)
- **Max tokens per turn:** 16,384
- **Max iterations per message:** 15
- **Context windows:** 200,000 tokens (Opus 4.6, Sonnet 4.5, Haiku 4.5)

**Turn tracking:** The orchestrator tracks `_turn_count` across the session and emits `context_update` events so the frontend can display context usage.

---

## Tool Execution

### Heartbeat Mechanism

Long-running tools (those that make external API calls) use a heartbeat system to keep the user informed:

```python
# Every 8 seconds, emit a status update:
# "Still working on trial search... (16s)"
```

**Tools with heartbeat:** `search_trials`, `get_trial_details`, `get_eligibility_criteria`, `get_trial_locations`, `get_adverse_events`, `get_drug_label`, `generate_report`, `save_matched_trials`

The heartbeat runs as a concurrent `asyncio.Task` that is cancelled when the tool completes.

### Deferred Emissions

UI emission tools (`emit_widget`, `emit_trial_cards`, `emit_status`, `emit_partial_filters`) don't send data to the WebSocket immediately. Instead, they queue events in `_pending_emissions` and flush them after Claude's full response is processed. This prevents UI updates from appearing in the middle of a text response.

Exception: Status updates during tool execution (heartbeats) are emitted immediately since they provide real-time progress feedback.

### Result Truncation

Large tool results are managed to prevent context bloat:
- Trial search results are capped at 15 trials
- Brief titles are truncated to 120 characters
- Interventions are limited to 3 per trial
- Locations are limited to 10 per trial (5 in summaries)
- Progress is emitted every 10KB for large tool outputs (> 10,000 characters)

---

## WebSocket Protocol

### Client → Server

| Message Type | Payload | Trigger |
|---|---|---|
| `message` | `content` (text), optional `location_context` | User sends a chat message |
| `widget_response` | `selections[]`, `question` | User responds to an intake widget |
| `trial_selection` | `trialIds[]` | User selects trials for the report |
| `system_hint` | `content` (text) | Frontend sends contextual hints (e.g., zero results warning) |

### Server → Client

| Message Type | Payload | Purpose |
|---|---|---|
| `text` | `content` (chunk) | Streamed chat response text |
| `text_done` | — | End of a text response segment |
| `widget` | `question`, `widget_type`, `options` | Display structured input widget |
| `trial_cards` | `trials[]`, `selectable` | Display trial summary cards |
| `status` | `phase`, `message` | Progress indicator with spinner |
| `report_ready` | `session_id` | Report is available for viewing |
| `filters_update` | Filter fields | Update stats panel filters |
| `context_update` | `turn_count`, usage info | Context window usage tracking |
| `done` | — | Processing complete for this message |
| `error` | `message` | Error occurred during processing |
| `health_imported` | `session_id` | Apple Health import completed |

---

## Session Management

### File-Based Storage

Sessions are stored as JSON files in `sessions/{session_id}/`:

```
sessions/
  AB3K7M/
    state.json              — Phase, flags, conversation history
    patient_profile.json    — Demographics, condition, preferences
    search_results.json     — Raw trial search results
    matched_trials.json     — Scored and analyzed trials
    report.html             — Generated HTML report
    deep_dives/             — (Reserved for future per-trial analysis)
```

**Session IDs:** 6 characters from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous characters like O/0, I/1/L).

### Why JSON Files?

- **Zero setup** — No database to configure for development or demo
- **Human-readable** — Session state can be inspected directly in a text editor
- **Sufficient for demo** — A hackathon project doesn't need distributed storage
- **Stateless backend** — Each request reconstructs the orchestrator from the session file

### Orchestrator Caching

Orchestrator instances are cached in memory per session ID to avoid re-reading session files and rebuilding conversation history on every WebSocket message. The cache is a simple dictionary keyed by session ID.

---

## Context Engineering

### Dynamic System Prompt

The system prompt is rebuilt on every Claude API call from four components:

1. **Base prompt** (`orchestrator.md`) — Always present. Defines the agent's identity, medical safety rules, tool usage guidelines, and overall behavior.
2. **Phase prompt** — Changes with each phase transition. Defines phase-specific objectives, available tools, and expected behaviors. See [Agents and Phases](agents-and-phases.md#phase-details).
3. **Skill prompts** — Loaded during MATCHING, REPORT, and FOLLOWUP phases. Provide detailed rules for eligibility scoring and medical translation.
4. **Session context** — Dynamic state injected at the end: session ID, current phase, completion flags, patient profile, health data, and (during intake) collected answers.

### Conversation History Trimming

Long conversations are trimmed to stay within context limits:

| Phase | Threshold | Kept |
|---|---|---|
| INTAKE (profile incomplete) | 50 messages | Last ~20 |
| All other phases | 24 messages | Last ~20 |

**Trimming rules:**
- Tool use / tool result pairs are never split at the boundary
- A synthetic bridge message is prepended: `"[Earlier conversation trimmed to save context. See session state for details.]"`
- If the kept portion starts with a `user` message, a synthetic assistant acknowledgment is inserted to maintain valid message alternation

### Intake Answer Resilience

During intake, patient answers are stored in two places:
1. **Conversation history** — Natural flow of the interview
2. **Session state** (`intake_answers`) — Explicit key-value storage

This dual storage means that even if early conversation turns are trimmed, the patient's answers survive in the session context that's injected into every system prompt. The intake threshold of 50 messages (vs. 24) provides additional buffer.

---

## Stats API

The stats panel operates independently of Claude. It queries the AACT PostgreSQL database directly via 30 REST endpoints.

### Endpoint Categories

| Category | Count | Examples |
|---|---|---|
| Core (filterable) | 9 | Total count, faceted query, top conditions, sponsors, enrollment, matched trials, geocoding (2), raw SQL |
| Per-session | 21 | Study types, gender, age groups, interventions, duration, start years, facilities, countries, completion rate, funder types, and 11 more |

### Query Flow

```
Frontend StatsPanel
    │
    ├─ POST /api/stats/query (with filters) ──► Faceted stats (phase, status, geo, funnel)
    │
    └─ GET /api/stats/{chart-endpoint}?session_id=... ──► Per-session chart data
                                                              │
                                                              ▼
                                                    AACT PostgreSQL
                                                    (asyncpg pool)
```

**Connection pool:** Min 2, max 5 connections (under AACT's 10-per-account limit), 15-second query timeout.

**Key patterns:**
- All queries use parameterized placeholders (`$1, $2, ...`) — no string interpolation
- Condition matching splits search terms into per-word `ILIKE` clauses
- `COUNT(DISTINCT s.nct_id)` prevents duplicate counts from multi-facility trials
- Raw SQL endpoint (`/api/stats/raw-query`) allows read-only `SELECT` queries with safety guards (blocks `DROP`, `DELETE`, `UPDATE`, etc., enforces 500-row limit)

See [Data Sources — AACT](data-sources.md#aact-postgresql-database) for database details.

---

## Report Generation

### HTML Report

The report is generated from a Jinja2 template ([`backend/report/templates/report.html`](../backend/report/templates/report.html)) that produces a self-contained, WCAG AA accessible HTML document.

**Data flow:**
1. Claude calls `generate_report` with questions for doctor and glossary
2. The tool loads the patient profile, selected matched trials, and health import data from session files
3. Jinja2 renders the HTML template with all data
4. The HTML is saved to `sessions/{id}/report.html`
5. A `report_ready` WebSocket event is emitted to the frontend

### PDF Export

PDF generation uses Playwright (headless Chromium) to render the HTML report and print to PDF.

```
GET /api/sessions/{id}/report.pdf
    │
    ├─ Playwright installed? ──► Launch Chromium, render HTML, print to PDF
    │
    └─ Not installed? ──► Return HTML with banner:
                          "PDF generation requires Playwright.
                           Install with: playwright install chromium"
```

**Graceful degradation:** If Playwright is not installed (common in development), the PDF endpoint returns the HTML report with an informational banner instead of failing.

---

## Error Handling

| Layer | Strategy |
|---|---|
| Tool execution | Try/except per tool; errors returned as tool_result text to Claude, which can retry or inform the user |
| WebSocket | Catch-all around message processing; errors sent as `error` type messages |
| Stats API | `RuntimeError` → 503 (database not configured); `Exception` → 503 (database unavailable) |
| Session I/O | `ValueError` for missing sessions; graceful defaults for missing optional files |
| Heartbeat | `asyncio.CancelledError` handled silently when tool completes |
