# TODO
1) Pair device should be expanded by default on first page load. 

2) Ensure that every row in the status breakdown graph in the data panel has a label as we did earlier for the top conditions graph. 

2.25) Make the map slightly taller and the data panel slightly wider by default.

2.5) Update the agent system prompt to not use emojis in output, keep a clinical/professional tone.

3) Include trials which are in statuses "recruiting", "unknown", or "not yet recruiting" in the data pane by default when the page loads and use these as the basis for matching, provided that we don't get disconfirming information from the user chat and tool calls.  

5) Improve subagent/phase visualization. Output every request we make and substep to the logging area by the phases/subagents. The user should see exactly which NCT is being analyzed or matched, which drug is being matched, etc. The Matching phase/agent especially seems not not output logging items below itself. EVERY PHASE/agent should output it's step by step process. The application should ALWAYS look alive to the user with progress or a spinner.

5.5) Sequence the phase distribution entries so that they are in phase-wise chronological order, i.e. Early Phase 1, Phase 1, Phase 2, Phase 3. Do not display N/A or other non-matching phases. Move the phases below the status breakdown.

5.75) Add several other items to the data panel. Be creative and look at the database schema and structure. What other visualizations would be useful to a user, or compelling in a demo? Include a paginated table of the NCT IDs which match so far, with clickable links to the detail pages, along with other appropriate columns (disease, phase, status, etc.) Add several more visualizations below the existing ones. I will explore them when complete and select which to include. 

6) Output the matched trials in a shadcn carousel and allow the user to cycle through and check to select them.

7) Increase the size of the "match percentage" badge and make the type larger and more legible.

8) Generate a well formatted PDF version briefing report.

9) 