# Clinical Trial Navigator — Claude Agent SDK Specification

## Project Overview

**Hackathon**: Built with Opus 4.6: a Claude Code Hackathon (Cerebral Valley × Anthropic)
**Timeline**: February 10–16, 2026 (6 days)
**Team Size**: Solo or duo (max 2)
**Budget**: $500 Claude API credits
**Problem Statements Addressed**: All three — Build a Tool That Should Exist, Break the Barriers, Amplify Human Judgment

### Elevator Pitch

A conversational agent that helps patients and caregivers navigate the 450,000+ clinical trials on ClinicalTrials.gov. It conducts a structured intake interview, searches and filters trials against the user's profile, translates complex medical eligibility criteria into plain language, and generates a personalized briefing document they can bring to their doctor. Built entirely on the Claude Agent SDK with Opus 4.6.

### Why This Wins

- Touches all three problem statements simultaneously
- Uses massive, free, well-structured public datasets
- Visceral demo: type in a real condition, get back something a real patient could use
- 1M context window matters: loading full protocol documents for deep-dive analysis
- Agent SDK architecture is natural and showcases multi-agent coordination
- Genuine human impact — this tool doesn't exist well today

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   Web UI (React/Next.js)                │
│  ┌──────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │ Chat      │  │ AskUser    │  │ Visualization     │  │
│  │ Interface │  │ Widgets    │  │ Panel (map, charts│  │
│  └─────┬─────┘  └─────┬──────┘  └────────┬──────────┘  │
└────────┼──────────────┼────────────────────┼────────────┘
         │              │                    │
         ▼              ▼                    ▼
┌────────────────────────────────────────────────────────┐
│              Orchestrator Agent (main)                   │
│  - Manages conversation state                           │
│  - Routes to subagents                                  │
│  - Maintains patient profile as files                   │
│  - Coordinates human-in-the-loop checkpoints            │
└───┬──────────┬──────────┬──────────┬───────────────────┘
    │          │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼──────────┐
│Intake │ │Search │ │Match/ │ │Report        │
│Agent  │ │Agent  │ │Translate│ │Generator    │
│       │ │       │ │Agent  │ │              │
└───────┘ └───────┘ └───────┘ └──────────────┘
```

### Technology Stack

- **Runtime**: Claude Agent SDK (Python)
- **Model**: claude-opus-4-6 (via API credits)
- **Web Framework**: Next.js or FastAPI + React frontend
- **MCP Servers**: Custom servers for ClinicalTrials.gov API, openFDA API, geocoding
- **Visualization**: Recharts or Plotly (React), or server-side matplotlib
- **Output**: HTML report (accessible), optional PDF via headless browser

---

## External Datasets & Services

### Primary Data Sources

| Source | URL | Auth | Format | Usage |
|--------|-----|------|--------|-------|
| **ClinicalTrials.gov API v2** | `https://clinicaltrials.gov/api/v2/studies` | None (free) | JSON | Trial search, details, eligibility criteria |
| **openFDA Drug Adverse Events** | `https://api.fda.gov/drug/event.json` | API key (free) | JSON | Side effect context for investigational drugs |
| **openFDA Drug Labels** | `https://api.fda.gov/drug/label.json` | API key (free) | JSON | Drug information, indications, warnings |
| **FDA Drug Trial Snapshots** | `https://www.fda.gov/drugs/drug-approvals-and-databases/drug-trials-snapshots` | None | HTML/scraped | Demographic representation data |
| **Open-Meteo Geocoding** | `https://geocoding-api.open-meteo.com/v1/search` | None (free) | JSON | Convert location names to lat/lng for distance calculations |
| **NCI Cancer Statistics (SEER)** | `https://seer.cancer.gov/data/` | Registration | CSV | Incidence/prevalence data for context |

### ClinicalTrials.gov API v2 — Key Endpoints

```
GET /studies?query.cond={condition}&query.intr={intervention}
    &filter.overallStatus=RECRUITING
    &filter.geo=distance({lat},{lng},{distance_miles}mi)
    &pageSize=100
    &fields=NCTId,BriefTitle,Phase,OverallStatus,
            EligibilityCriteria,BriefSummary,
            LocationFacility,LocationCity,LocationState,
            LocationCountry,LocationGeoPoint,
            StartDate,CompletionDate,
            InterventionName,InterventionType,
            Condition,EnrollmentCount,StudyType

GET /studies/{nctId}  — Full study record
```

**Rate limits**: 10 requests/second (generous for this use case)

### openFDA API — Key Endpoints

```
GET /drug/event.json?search=patient.drug.openfda.generic_name:"{drug}"
    &count=patient.reaction.reactionmeddrapt.exact
    &limit=20

GET /drug/label.json?search=openfda.generic_name:"{drug}"
    &limit=1
```

**Rate limits**: 240 requests/minute with API key, 40/minute without

---

## MCP Servers to Build

### 1. `clinical-trials-mcp` — ClinicalTrials.gov Search Server

**Transport**: stdio
**Tools exposed**:

```python
@tool
def search_trials(
    condition: str,
    intervention: str | None = None,
    phase: list[str] | None = None,  # ["PHASE1", "PHASE2", "PHASE3"]
    status: list[str] | None = None,  # ["RECRUITING", "NOT_YET_RECRUITING"]
    latitude: float | None = None,
    longitude: float | None = None,
    distance_miles: int = 100,
    max_results: int = 50
) -> list[TrialSummary]:
    """Search ClinicalTrials.gov for matching studies."""

@tool
def get_trial_details(nct_id: str) -> TrialFullRecord:
    """Get complete study record including full eligibility criteria, 
    locations, contacts, outcome measures, and study design."""

@tool
def get_eligibility_criteria(nct_id: str) -> EligibilityCriteria:
    """Extract and parse eligibility criteria into structured 
    inclusion/exclusion lists."""

@tool
def get_trial_locations(nct_id: str) -> list[TrialLocation]:
    """Get all recruiting sites with contact info and geo coordinates."""
```

### 2. `fda-data-mcp` — openFDA Data Server

**Transport**: stdio
**Tools exposed**:

```python
@tool
def get_adverse_events(
    drug_name: str,
    limit: int = 20
) -> list[AdverseEvent]:
    """Get most commonly reported adverse events for a drug."""

@tool
def get_drug_label(drug_name: str) -> DrugLabel:
    """Get FDA-approved drug label with indications, warnings, 
    dosing, and contraindications."""

@tool  
def get_demographic_representation(
    drug_name: str | None = None,
    therapeutic_area: str | None = None
) -> DemographicData:
    """Get demographic participation data from FDA Drug Trial Snapshots.
    Shows representation by age, sex, race, ethnicity."""
```

### 3. `geocoding-mcp` — Location Services Server

**Transport**: stdio
**Tools exposed**:

```python
@tool
def geocode_location(location_string: str) -> GeoPoint:
    """Convert a location name/address to lat/lng coordinates.
    Uses Open-Meteo geocoding API (free, no auth)."""

@tool
def calculate_distance(
    point_a: GeoPoint, 
    point_b: GeoPoint
) -> float:
    """Calculate distance in miles between two geographic points."""

@tool
def find_nearby_cities(
    latitude: float,
    longitude: float,
    radius_miles: int = 200
) -> list[str]:
    """Find major cities within radius for expanding trial search."""
```

---

## Agent Definitions

### Orchestrator Agent (main entry point)

**File**: `orchestrator.py`
**System prompt**: Stored in `.claude/agents/orchestrator.md`

```markdown
# Orchestrator Agent

You are the Clinical Trial Navigator, helping patients and caregivers 
find and understand clinical trials. You coordinate specialized sub-agents 
to provide comprehensive, accurate, and compassionate guidance.

## Your Responsibilities
1. Manage the conversation flow through intake → search → analysis → report
2. Maintain the patient profile in ./session/patient_profile.json
3. Ensure every recommendation includes appropriate medical disclaimers
4. Never provide medical advice — frame everything as information to discuss 
   with their healthcare provider
5. Coordinate human-in-the-loop checkpoints at key decision points

## Session State
- Store all intermediate data in ./session/
- Patient profile: ./session/patient_profile.json
- Search results: ./session/search_results.json
- Matched trials: ./session/matched_trials.json
- Final report: ./session/report.html

## Medical Disclaimer (include at start of every session)
"I'm an AI assistant that helps you explore clinical trial options. 
I don't provide medical advice. All information should be discussed 
with your healthcare provider before making any decisions."
```

### Intake Agent

**File**: `.claude/agents/intake.md`

```markdown
# Intake Agent

You conduct a structured but conversational intake interview to build 
the patient profile. You must gather enough information to search 
effectively without overwhelming the patient.

## Required Information (gather through conversation)
1. **Primary condition** — diagnosis, stage/grade if applicable
2. **Treatment history** — what treatments have been tried, current medications
3. **Location** — city/state/zip or willingness to travel
4. **Basic demographics** — age, sex (relevant for eligibility)
5. **General health status** — using plain language, map to approximate 
   ECOG performance status internally (don't use the term with patients)
6. **Preferences** — phase preference, willingness to accept placebo, 
   travel distance, virtual/in-person preference

## Conversation Style
- Warm, empathetic, never clinical or cold
- One question at a time when possible
- Acknowledge emotions — a diagnosis is scary
- Use AskUserQuestion widgets for structured choices
- Use free-text for condition description and treatment history

## Output
Write completed profile to ./session/patient_profile.json
```

### Search Agent

**File**: `.claude/agents/search.md`

```markdown
# Search Agent

You execute comprehensive trial searches using the clinical-trials-mcp server.
Run multiple search strategies to ensure broad coverage.

## Search Strategies (run all applicable)
1. **Exact condition match** — primary diagnosis as entered
2. **Broader condition match** — parent condition category
3. **Intervention-specific** — if patient mentioned interest in specific 
   treatment types (immunotherapy, targeted therapy, etc.)
4. **Geographic expansion** — if few results nearby, expand radius 
   or search for virtual/decentralized trials
5. **Phase-specific** — if patient has phase preferences

## Deduplication
Merge results by NCT ID across searches. Store complete results 
in ./session/search_results.json with source strategy tagged.

## Output
- Total trials found per strategy
- Deduplicated combined list
- Summary statistics: phases, distances, intervention types
```

### Match & Translate Agent

**File**: `.claude/agents/match_translate.md`

```markdown
# Match & Translate Agent

You perform two critical functions:
1. Score each trial against the patient profile for eligibility fit
2. Translate medical language into plain language

## Eligibility Scoring
For each trial, categorize each eligibility criterion as:
- ✅ LIKELY MET — patient profile clearly satisfies this
- ❌ LIKELY NOT MET — patient profile clearly fails this
- ❓ NEEDS DISCUSSION — requires clinical assessment or additional info
- ➖ NOT ENOUGH INFO — can't determine from profile

Compute an overall fit score: (LIKELY MET) / (total criteria) as percentage.
Flag any absolute disqualifiers prominently.

## Plain Language Translation
For the top-ranked trials, rewrite:
- Eligibility criteria → plain language explanations
- Study design → what participation actually looks like day-to-day
- Primary/secondary outcomes → what the study is trying to learn
- Intervention details → what treatment you'd receive and how

## Reading Level Target
- 8th grade reading level (Flesch-Kincaid)
- Define any medical terms on first use
- Use analogies for complex concepts

## Output
Write to ./session/matched_trials.json with scores and translations.
```

### Report Generator Agent

**File**: `.claude/agents/report_generator.md`

```markdown
# Report Generator Agent

You produce the final patient briefing as an accessible HTML document.

## Report Sections
1. **Executive Summary** — "Based on your profile, we found X recruiting 
   trials. Here are the Y best matches."
2. **Your Profile Summary** — confirm what the system understood 
   (patient should verify)
3. **Top Trial Matches** (5-10 trials) — each with:
   - Plain language summary
   - Fit score with explanation
   - Key eligibility notes (met/unmet/discuss)
   - Location and distance
   - Time commitment estimate
   - What treatment involves
   - Known side effects (from openFDA data)
4. **Comparison Table** — trials side-by-side on key dimensions
5. **Questions for Your Doctor** — tailored to the specific trials
6. **Demographic Representation** — if FDA DTS data available, show 
   how well people like the patient have been represented
7. **Next Steps** — how to express interest in a trial, what to expect
8. **Glossary** — medical terms used, with definitions

## Accessibility Requirements
- Semantic HTML (proper heading hierarchy, landmarks)
- All data tables have proper headers and scope attributes
- Sufficient color contrast (WCAG AA minimum)
- Alt text for any charts/visualizations
- Keyboard navigable
- Screen reader tested output structure

## Output
Write to ./session/report.html
Also generate ./session/report_summary.md for quick reference.
```

---

## Human-in-the-Loop Checkpoints

The agent must pause and get explicit human input at these points. Use `AskUserQuestion`-style widgets (in the web UI, these render as interactive selection widgets; via the Agent SDK, implement as structured tool calls that the frontend renders).

### Checkpoint 1: Intake — Condition & Treatment History

**Type**: Free-text input (condition is too variable for multiple choice)
**Implementation**: Orchestrator asks conversationally, user responds in natural language

```
Agent: "Let's start with the basics. What condition are you exploring 
        clinical trials for? Include the specific diagnosis, stage, or 
        subtype if you know it."

User:  [free text response]

Agent: "Thank you. What treatments have you already tried or are 
        currently receiving for this condition?"

User:  [free text response]
```

### Checkpoint 2: Intake — Structured Profile (AskUserQuestion)

**Type**: Multiple structured questions with selection widgets

```python
# Rendered as interactive widgets in the web UI
questions = [
    {
        "question": "What types of trials interest you?",
        "type": "multi_select",
        "options": [
            "Treatment trials (testing new therapies)",
            "Prevention trials",
            "Diagnostic trials",
            "Any type — show me everything"
        ]
    },
    {
        "question": "Which trial phases are you open to?",
        "type": "multi_select",
        "options": [
            "Phase 1 (first-in-human, small group, safety focused)",
            "Phase 2 (larger group, effectiveness testing)",
            "Phase 3 (large-scale, compared to standard treatment)",
            "Not sure — help me understand"
        ]
    },
    {
        "question": "How far are you willing to travel for treatment?",
        "type": "single_select",
        "options": [
            "Within 50 miles of home",
            "Within 200 miles",
            "Anywhere in my state / region",
            "Anywhere in the US (willing to travel)"
        ]
    },
    {
        "question": "Are you open to placebo-controlled trials?",
        "type": "single_select",
        "options": [
            "Yes, I understand some participants receive placebo",
            "Only if I'm guaranteed the active treatment",
            "I need help understanding what this means"
        ]
    }
]
```

### Checkpoint 3: Search Confirmation

**Type**: Confirmation with preview
**Trigger**: After intake is complete, before executing searches

```
Agent: "Here's what I'll search for:
        - Condition: Stage III non-small cell lung cancer
        - Location: Within 200 miles of Lompoc, CA
        - Phases: 2 and 3
        - Status: Currently recruiting
        - Treatment type: Any
        
        I'll also search for virtual/decentralized trials nationwide.
        
        Does this look right, or would you like to adjust anything?"

User: [confirm or modify]
```

### Checkpoint 4: Results Review — Trial Selection

**Type**: Multi-select from ranked results
**Trigger**: After search and initial matching, before deep analysis

```python
# Present top 15-20 matches as selectable cards
# Each card shows: title, phase, location, fit score, 1-line summary
questions = [
    {
        "question": "I found {N} potentially matching trials. Here are the "
                    "top matches ranked by fit. Select the ones you'd like "
                    "me to analyze in detail (I recommend 5-10):",
        "type": "multi_select",
        "options": [
            f"{trial.brief_title} — Phase {trial.phase}, "
            f"{trial.distance_miles}mi away, {trial.fit_score}% fit"
            for trial in top_matches[:15]
        ]
    }
]
```

### Checkpoint 5: Deep Dive Request

**Type**: Single-select from analyzed trials
**Trigger**: After report is generated, in follow-up conversation

```
Agent: "Your briefing is ready. Would you like to:"

options = [
    "Deep-dive into a specific trial (I'll load the full protocol)",
    "Compare two specific trials side-by-side",
    "Learn more about a specific drug or treatment mentioned",
    "Generate a list of questions for my doctor",
    "I'm good for now — download my report"
]
```

### Checkpoint 6: Report Confirmation

**Type**: Confirmation before generating final output
**Trigger**: Before writing the final report

```
Agent: "I'm ready to generate your personalized briefing. It will include:
        - {N} trial summaries in plain language
        - A comparison table
        - Eligibility analysis for each trial
        - Suggested questions for your doctor
        - Demographic representation data
        
        Any trials you'd like me to add or remove before I generate it?"

User: [confirm or modify]
```

---

## File System as Context Engineering

The Agent SDK's core pattern: store intermediate state as files the agent reads back.

```
./session/
├── patient_profile.json       # Structured intake data
├── search_results.json        # Raw ClinicalTrials.gov responses  
├── matched_trials.json        # Scored + translated trials
├── deep_dives/
│   ├── NCT12345678.json       # Full protocol analysis
│   └── NCT87654321.json
├── fda_data/
│   ├── adverse_events/        # Cached adverse event lookups
│   └── drug_labels/           # Cached drug label lookups
├── report.html                # Final accessible HTML report
├── report_summary.md          # Quick reference summary
└── conversation_state.json    # Session tracking metadata
```

### Patient Profile Schema

```json
{
  "condition": {
    "primary_diagnosis": "Non-small cell lung cancer",
    "stage": "Stage IIIA",
    "subtype": "Adenocarcinoma",
    "biomarkers": ["EGFR mutation negative", "PD-L1 TPS 60%"],
    "date_of_diagnosis": "2025-10"
  },
  "treatment_history": [
    {
      "treatment": "Carboplatin + Pemetrexed",
      "type": "chemotherapy",
      "cycles_completed": 4,
      "response": "partial response",
      "end_date": "2026-01"
    }
  ],
  "demographics": {
    "age": 62,
    "sex": "male",
    "estimated_ecog": 1
  },
  "location": {
    "description": "Lompoc, CA",
    "latitude": 34.6392,
    "longitude": -120.4579,
    "max_travel_miles": 200,
    "open_to_virtual": true
  },
  "preferences": {
    "trial_types": ["treatment"],
    "phases": ["PHASE2", "PHASE3"],
    "placebo_acceptable": true,
    "intervention_interests": ["immunotherapy"]
  }
}
```

---

## Visualization Requirements

### 1. Trial Location Map

- Plot matched trial sites on an interactive map
- Color-code by fit score (green = high, yellow = medium, red = low)
- Show patient location with distance circles (50mi, 100mi, 200mi)
- Click a pin → show trial summary card
- **Implementation**: Leaflet.js with OpenStreetMap tiles (free, no API key) or a React artifact with a simple map component

### 2. Demographic Representation Chart

- Bar chart showing trial participation by age group, sex, race/ethnicity
- Overlay the patient's demographic with a marker
- Highlight underrepresentation: "Only 14% of prior trial participants for this drug class were 60+"
- **Data source**: FDA Drug Trial Snapshots (pre-scraped or fetched live)
- **Implementation**: Recharts (React) or matplotlib (server-side image)

### 3. Trial Comparison Matrix

- Interactive table/heatmap: rows = trials, columns = key dimensions
- Dimensions: phase, distance, fit score, time commitment, known side effects severity, enrollment size, estimated completion date
- Sortable by any column
- **Implementation**: React table component or HTML table in report

### 4. Trial Phase Pipeline

- Visual showing how many trials are in each phase for the patient's condition
- Gives context: "There are 45 Phase 3 trials for your condition, suggesting several promising treatments are in late-stage testing"
- **Implementation**: Simple bar/funnel chart

---

## Skills Files

### `.claude/skills/medical_translation.md`

```markdown
# Medical Translation Skill

When translating medical text to plain language:
1. Replace jargon with common equivalents on first use
2. Provide the medical term in parentheses for reference
3. Use concrete analogies for abstract concepts
4. Quantify when possible ("about 3 in 10 people" vs "some patients")
5. Target 8th grade reading level
6. Never downplay risks or overstate benefits
7. Always note uncertainty honestly

## Common Translations
- "Randomized" → "Assigned by chance (like flipping a coin)"
- "Double-blind" → "Neither you nor your doctor knows which treatment you're getting"
- "Placebo-controlled" → "Some participants receive an inactive treatment for comparison"
- "ECOG PS 0-1" → "Able to carry out everyday activities with at most minor limitations"
- "Progression-free survival" → "How long the cancer stays stable or shrinks"
- "Adverse events" → "Side effects or health problems during the study"
```

### `.claude/skills/eligibility_analysis.md`

```markdown
# Eligibility Analysis Skill

When analyzing trial eligibility against a patient profile:

## Scoring Rules
- Only mark ✅ LIKELY MET if the profile clearly satisfies the criterion
- Mark ❌ LIKELY NOT MET only for clear disqualifiers
- Default to ❓ NEEDS DISCUSSION when uncertain
- Never make clinical judgments (e.g., don't assess lab values you don't have)

## Common Criteria Patterns
- Age range: Check directly against profile
- Prior treatment: Match against treatment history
- ECOG status: Use estimated status from intake
- Biomarkers: Match if known, otherwise ❓
- Organ function (liver, kidney, etc.): Almost always ❓ (requires labs)
- Washout periods: Calculate from last treatment end date
- Active brain metastases: ❓ unless explicitly stated
- Prior immunotherapy: Check treatment history type field

## Critical Rule
NEVER tell a patient they are definitely eligible or ineligible. 
Frame as: "Based on what you've shared, you appear to [likely meet / 
not meet / need to discuss with your doctor] this criterion."
```

---

## Hooks Configuration

### `.claude/settings.json`

```json
{
  "hooks": {
    "preToolExecution": [
      {
        "tool": "write",
        "command": "python ./hooks/validate_medical_disclaimer.py",
        "description": "Ensure medical disclaimers are present in patient-facing outputs"
      }
    ],
    "postToolExecution": [
      {
        "tool": "clinical-trials-mcp:search_trials",
        "command": "python ./hooks/log_search.py",
        "description": "Log all trial searches for session audit trail"
      }
    ]
  }
}
```

---

## Implementation Plan (6-Day Timeline)

### Day 1 (Tuesday): Foundation
- [ ] Set up project structure, Agent SDK boilerplate
- [ ] Build `clinical-trials-mcp` server with `search_trials` and `get_trial_details`
- [ ] Test API connectivity and response parsing
- [ ] Create patient profile schema and file-based session management
- [ ] **Milestone**: Can search ClinicalTrials.gov and get structured results

### Day 2 (Wednesday): Core Agents
- [ ] Implement Intake Agent with conversational flow
- [ ] Implement Search Agent with multi-strategy search
- [ ] Build `geocoding-mcp` server
- [ ] Wire up Orchestrator for intake → search flow
- [ ] **Milestone**: Can conduct intake and return search results

### Day 3 (Thursday): Intelligence Layer
- [ ] Implement Match & Translate Agent
- [ ] Build eligibility scoring logic
- [ ] Build plain language translation pipeline
- [ ] Build `fda-data-mcp` server for adverse events and drug labels
- [ ] **Milestone**: Can score trials against profile and translate criteria

### Day 4 (Friday): Report & Visualization
- [ ] Implement Report Generator Agent
- [ ] Build accessible HTML report template
- [ ] Add trial location map visualization
- [ ] Add comparison table and demographic charts
- [ ] **Milestone**: Can generate complete patient briefing

### Day 5 (Saturday): Web UI & Integration
- [ ] Build web interface with chat + AskUserQuestion widgets
- [ ] Implement all human-in-the-loop checkpoints
- [ ] Add deep-dive follow-up conversation flow
- [ ] End-to-end testing with real conditions
- [ ] **Milestone**: Full flow works end-to-end in web UI

### Day 6 (Sunday): Polish & Demo
- [ ] Test with diverse conditions (cancer, rare disease, chronic illness)
- [ ] Fix edge cases (no results, ambiguous conditions, etc.)
- [ ] Record demo video
- [ ] Write submission README
- [ ] **Milestone**: Submission-ready

---

## Key Technical Decisions for Claude Code

### Questions Claude Code should ask me incrementally:

1. **Web framework**: "Do you want the web UI in Next.js (React) or FastAPI + vanilla React? Next.js is faster to scaffold but heavier."
2. **MCP server language**: "Python or TypeScript for MCP servers? Python is more natural for data processing; TypeScript if you prefer unified stack."
3. **Visualization approach**: "Server-side (matplotlib → images) or client-side (Recharts/Leaflet in React)? Client-side is more interactive but more frontend work."
4. **Report format**: "HTML only, or also generate PDF? PDF adds a dependency (puppeteer/playwright for headless rendering) but is more portable."
5. **Deployment**: "Local development only, or deploy to a public URL for demo? If deploying, preferred platform (Vercel, Railway, fly.io)?"
6. **Session persistence**: "In-memory only (fine for demo), or persist sessions to disk/SQLite?"
7. **API key management**: "How do you want to handle the openFDA API key and Claude API key? .env file?"
8. **Demo data**: "Should I create a pre-loaded demo profile for the hackathon presentation so the demo starts mid-flow?"

---

## Safety & Ethical Guardrails

### Hard Rules
1. **Never provide medical advice** — always frame as "information to discuss with your healthcare provider"
2. **Never recommend one trial over another** — present information, let patient and doctor decide
3. **Never make eligibility determinations** — only "likely meets" / "needs discussion" / "likely does not meet"
4. **Always include disclaimers** in all patient-facing outputs
5. **Never store personal health information** beyond the session — all data in `./session/` is ephemeral
6. **Never contact trial sites** on behalf of the patient
7. **Acknowledge limitations** — the agent doesn't have access to lab results, imaging, full medical history

### Soft Guidelines
- Be compassionate — patients searching for trials are often scared
- Be honest about uncertainty — "I'm not sure about this, and it's worth asking your doctor"
- Don't create false hope — if a trial is unlikely to be a fit, say so gently
- Respect patient autonomy — present options, don't push
- If the patient seems distressed, acknowledge it and suggest speaking with their care team

---

## Demo Script (3-minute hackathon presentation)

1. **[0:00-0:30]** Open the web UI. Type: "I was recently diagnosed with stage IIIA NSCLC adenocarcinoma. I've completed 4 cycles of carboplatin/pemetrexed with partial response. I'm 62, live in Lompoc CA."
2. **[0:30-1:00]** Show the AskUserQuestion widgets for preferences. Select: Phase 2-3, within 200 miles, open to immunotherapy, willing to accept placebo.
3. **[1:00-1:30]** Show the search executing across ClinicalTrials.gov, results populating. Show the trial selection checkpoint — 23 matches found, select top 8.
4. **[1:30-2:15]** Show the generated report: trial summaries in plain language, the map with UCLA/Cedars-Sinai/UCSB pins, the comparison table, the eligibility analysis with ✅/❌/❓ indicators, the demographic representation chart.
5. **[2:15-2:45]** Deep-dive: "Tell me more about the Pembrolizumab trial at UCLA — what would a typical week look like?" Show the agent loading the full protocol and generating a day-by-day participation description.
6. **[2:45-3:00]** Show the "Questions for Your Doctor" section. Close with: "This tool doesn't replace your oncologist. It helps you walk into that appointment informed, prepared, and empowered."

---

## Success Metrics

- **Functional prototype**: End-to-end flow works for at least 3 different conditions
- **Data richness**: Pulls from ClinicalTrials.gov + openFDA in real time
- **Plain language quality**: A non-medical person can understand every output
- **Accessibility**: Report passes axe-core audit at AA level
- **Agent coordination**: Clear evidence of multi-agent orchestration via Agent SDK
- **Human-in-the-loop**: All 6 checkpoints functional with interactive widgets
