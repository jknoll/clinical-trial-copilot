# Clinical Trial Navigator — Demo Script (3 min)

## Setup
- Backend running: `uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload`
- Frontend running: `cd frontend && npm run dev`
- Browser open to http://localhost:3000

## Demo Flow

### Opening (15 sec)
"Clinical Trial Navigator helps patients and caregivers find and understand clinical trials. It turns 450,000+ trials on ClinicalTrials.gov into personalized, plain-language guidance."

### Intake Interview (45 sec)
Type:
> I have stage IIIA non-small cell lung cancer, adenocarcinoma subtype. I'm 62 years old, male, and live in Lompoc, California. I've had 4 cycles of carboplatin and pemetrexed which stopped working, plus radiation therapy. I'm interested in immunotherapy trials.

Show: Claude acknowledges warmly, presents the medical disclaimer, then asks follow-up questions about activity level, travel willingness, and placebo comfort.

Acknowledge disclaimer, answer follow-up questions. Point out the structured widgets for preferences.

### Profile Confirmation (15 sec)
Show the profile summary Claude generates. Confirm it's correct.

"Notice how Claude gathered all the key information — condition, stage, treatment history, location, and preferences — through a natural conversation, then confirmed everything before proceeding."

### Trial Search (30 sec)
Watch the status messages as Claude:
1. Geocodes the patient's location
2. Runs multiple search strategies on ClinicalTrials.gov
3. Deduplicates results
4. Summarizes findings

"Claude uses multiple search strategies — exact condition match, broader category, intervention-specific — to maximize coverage. It's calling the real ClinicalTrials.gov API in real-time."

### Eligibility Matching (30 sec)
Show Claude analyzing eligibility criteria for each trial. Point out:
- Fit scores (percentage match)
- Plain language translations of medical criteria
- Color-coded ✅/❌/❓ indicators
- Trial cards appearing in the chat

"Every eligibility criterion is evaluated against the patient's profile and translated from medical jargon to 8th-grade reading level."

### Report Generation (30 sec)
After selecting trials, show the generated HTML report with:
- Executive summary
- Trial comparison table
- Eligibility checklists
- Questions for the doctor
- Glossary

"The report is WCAG AA accessible, printable, and designed to be shared with the patient's healthcare team."

### Closing (15 sec)
"Clinical Trial Navigator is built with Claude Opus 4.6 using streaming tool use, 3 MCP-style API servers, and a multi-phase agent architecture. It demonstrates how AI can make clinical trial information accessible to everyone — not just medical professionals."

## Key Points to Emphasize
1. **Real data** — Live ClinicalTrials.gov API, not mock data
2. **Multi-strategy search** — Cast a wide net, then rank by fit
3. **Plain language** — 8th-grade reading level throughout
4. **Safety** — Never says "you should," always frames as information for the doctor
5. **Human-in-the-loop** — Patient confirms at every major decision point
6. **Accessibility** — WCAG AA report, semantic HTML, proper contrast
