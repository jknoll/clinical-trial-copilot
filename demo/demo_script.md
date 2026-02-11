# Clinical Trial Navigator — Demo Script (3 min)

## Setup
- Backend running: `uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload`
- Frontend running: `cd frontend && npm run dev`
- Browser open to http://localhost:3000

---

## Demo Flow

### Opening (15 sec)
"Clinical Trial Navigator helps patients and caregivers find and understand clinical trials. It turns 450,000+ trials on ClinicalTrials.gov into personalized, plain-language guidance — for any condition, from common diseases like diabetes to rare pediatric cancers."

### Scenario 1: NSCLC Patient (1 min 30 sec)

**Intake (30 sec)** — Type:
> I have stage IIIA non-small cell lung cancer, adenocarcinoma subtype. I'm 62 years old, male, and live in Lompoc, California. I've had 4 cycles of carboplatin and pemetrexed which stopped working. My biomarkers: EGFR negative, PD-L1 TPS 60%. I'm interested in immunotherapy trials.

Show: Claude acknowledges warmly, presents the medical disclaimer, asks follow-up questions about activity level, travel willingness, and placebo comfort. Point out the structured selection widgets.

**Search + Matching (30 sec)** — Watch status messages as Claude:
1. Geocodes Lompoc, CA
2. Runs multi-strategy search on ClinicalTrials.gov
3. Evaluates eligibility criteria against the patient profile
4. Shows trial cards with fit scores and ✅/❌/❓ indicators

"Notice the real-time status updates — Claude is making live API calls to ClinicalTrials.gov, geocoding services, and the FDA adverse events database."

**Report (30 sec)** — Select 2-3 trials, then show the generated report:
- Executive summary, comparison table, eligibility checklists
- Questions for the doctor, glossary
- PDF download button (new!)

"The report is WCAG AA accessible, available in both HTML and PDF, and designed to take to your doctor."

### Scenario 2: Quick Condition Switch (30 sec)

Open a new session and type:
> I'm a 55-year-old woman in Houston, Texas with Type 2 diabetes. My A1C is 8.2 and I'm currently on metformin and Ozempic. I'm interested in trying new treatment approaches.

"The system works for any condition — not just cancer. Watch how it adapts its search strategy and eligibility analysis for a completely different disease area."

Point out: different search strategies, different eligibility criteria, different FDA drug data.

### Scenario 3: Rare Disease (30 sec)

Open a new session and type:
> My 17-year-old son was diagnosed with Ewing sarcoma of the femur. He's completed 6 cycles of VDC/IE chemotherapy with partial response. We're in Boston and willing to travel anywhere in the US.

"Rare diseases are where this tool shines — families often spend weeks searching ClinicalTrials.gov manually. The navigator finds relevant trials across multiple search strategies and geographic ranges in seconds."

### Closing (15 sec)
"Clinical Trial Navigator is built with Claude Opus 4.6 using streaming tool use, 15 tools across 3 MCP-style API servers, and a 6-phase agent architecture. It works for any condition — cancer, diabetes, rare diseases — making clinical trial information accessible to everyone."

---

## Key Points to Emphasize
1. **Real data** — Live ClinicalTrials.gov API, openFDA, geocoding — not mock data
2. **Any condition** — Tested with NSCLC, Type 2 Diabetes, and Ewing Sarcoma
3. **Multi-strategy search** — Cast a wide net, then rank by fit
4. **Plain language** — 8th-grade reading level throughout
5. **Safety** — Never says "you should," always frames as information for the doctor
6. **Human-in-the-loop** — Patient confirms at every major decision point
7. **Accessibility** — WCAG AA report, semantic HTML, proper contrast
8. **PDF export** — One-click PDF download for doctor visits
9. **Deployable** — Dockerized with Fly.io config, ready for production

## Demo Profiles (for pre-loading if needed)
Pre-built profiles in `demo/demo_profiles.json` cover all 3 scenarios:
- NSCLC (62M, Lompoc CA)
- Type 2 Diabetes (55F, Houston TX)
- Ewing Sarcoma (17M, Boston MA)

## Timing Backup Plan
If running short on time, skip Scenario 3 and go straight to closing after the diabetes demo. The NSCLC scenario is the most impressive; the diabetes scenario proves generalizability.
