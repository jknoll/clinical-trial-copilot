# Eligibility Analysis Skill

This skill provides rules for scoring clinical trial eligibility criteria against a patient profile. Apply these rules during the match and translate phase.

## Scoring Statuses

| Icon | Status | When to Use |
|---|---|---|
| LIKELY MET | The patient profile clearly satisfies this criterion. | Patient's age is 52 and criterion requires 18+. |
| LIKELY NOT MET | The patient profile clearly conflicts with this criterion. | Patient had 4 prior regimens and criterion allows maximum 2. |
| NEEDS DISCUSSION | The criterion is ambiguous, requires clinical judgment, or depends on information the patient should verify with their doctor. | Criterion requires "adequate organ function" -- lab values needed. |
| NOT ENOUGH INFO | The patient profile does not contain the data needed to evaluate. | Criterion requires specific biomarker status not discussed during intake. |

## Scoring Rules

1. **Age criteria:** Compare patient age directly. Mark LIKELY MET or LIKELY NOT MET. This is almost always deterministic.

2. **Prior treatment count:** Compare the number of prior lines of therapy the patient reported against the maximum or minimum allowed. If the patient's count is ambiguous (e.g., they mentioned "several treatments" without specifics), mark NEEDS DISCUSSION.

3. **ECOG / activity level:** Map the patient's self-reported activity level to approximate ECOG score (mapped during intake). Compare against the trial's ECOG requirement. If the mapping is borderline (e.g., patient could be ECOG 1 or 2, trial requires 0-1), mark NEEDS DISCUSSION.

4. **Biomarker requirements:** If the trial requires a specific biomarker (HER2+, EGFR mutation, PD-L1 expression, etc.) and the patient mentioned it, score accordingly. If not mentioned, mark NOT ENOUGH INFO.

5. **Organ function requirements:** These almost always require lab values (creatinine, bilirubin, ALT/AST, ANC, platelets). Unless the patient has shared recent lab results, mark NEEDS DISCUSSION and note which labs are needed.

6. **Washout periods:** If the trial requires a gap since last treatment, compare against when the patient reported their last treatment. If timing is unclear, mark NEEDS DISCUSSION.

7. **Brain metastases:** If the trial excludes brain metastases and the patient has not mentioned them, mark NOT ENOUGH INFO. If the patient mentioned brain involvement, mark LIKELY NOT MET and flag for doctor discussion.

8. **Prior immunotherapy / specific drug class:** If the trial excludes patients who received a specific drug class and the patient's treatment history includes it, mark LIKELY NOT MET. If treatment history does not mention it, mark NOT ENOUGH INFO (the patient may not have listed every treatment).

9. **Geographic / site availability:** If the trial has no sites within the patient's travel preference, note this separately from the fit score. It does not affect the eligibility percentage but is flagged prominently.

10. **Reproductive criteria:** If the trial requires contraception or excludes pregnant individuals, mark NEEDS DISCUSSION unless the patient's demographics make it clearly inapplicable.

## Critical Rule

**NEVER tell the patient they are definitely eligible or ineligible for any trial.** Eligibility is a preliminary assessment based on limited self-reported information. Only the trial's medical team can make a final eligibility determination after a formal screening process. Always use qualifying language:

- "Based on what you shared..."
- "You appear to meet this criterion, but your doctor can confirm."
- "This criterion may be a concern, but it is worth discussing with the trial team."
- "Final eligibility is always determined by the trial's doctors after a screening visit."

## Hard Exclusion Flag

If any single LIKELY NOT MET criterion is a hard exclusion (absolute age cutoff, wrong cancer type, excluded diagnosis), flag the entire trial as "Likely Ineligible" with an explanation. Still include the trial in results if the patient might want to discuss it with their doctor, but rank it below trials without hard exclusion flags.
