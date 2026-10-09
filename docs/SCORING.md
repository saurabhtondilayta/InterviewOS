# Scoring model and adaptive algorithm

All scores are **practice feedback**. They are produced by an AI evaluator applying a fixed rubric and combined by documented formulas. They do not measure employability and are only comparable between sessions with the same `rubric_version` and interview type.

## Answer evaluation (rubric v1)

The evaluator rates five general dimensions from 0 to 10 with anchors (0–2 missing/wrong, 3–4 weak, 5–6 partial, 7–8 good, 9–10 excellent):

| Dimension | Meaning |
|---|---|
| relevance | Does the answer address the question? |
| correctness | Are statements technically/factually right? |
| depth | Reasoning, detail, trade-offs, examples |
| communication | Structure and clarity (not accent, fluency or transcription errors) |
| problem_solving | Approach, decomposition, edge cases |

**Question score** = weighted average (code: `backend/app/services/interview/rubric.py`):

| Type | relevance | correctness | depth | communication | problem_solving |
|---|---|---|---|---|---|
| technical | .15 | .35 | .25 | .10 | .15 |
| resume | .20 | .20 | .30 | .15 | .15 |
| behavioral | .25 | .10 | .25 | .25 | .15 |
| hr | .30 | .10 | .20 | .30 | .10 |

**Coding and system design use a separate technical track**; communication is recorded but *not* mixed into their score:

| Coding | weight | System design | weight |
|---|---|---|---|
| correctness | .40 | requirements | .20 |
| efficiency | .25 | architecture | .35 |
| code_quality | .15 | scalability | .25 |
| edge_cases | .20 | trade_offs | .20 |

If the evaluator omits a technical criterion, the closest general dimension is used as a fallback (e.g. efficiency ← problem_solving).

**Session score** = mean of question scores. Reports also store per-dimension averages, per-track technical averages and per-topic averages.

## Adaptive algorithm (`adaptive.py`)

1. **Plan** — The role's competency framework (topics with weights and kinds) is filtered by interview type (e.g. a behavioral interview keeps only `behavioral` topics; *full*/*company* keep all). User-selected topics override the framework. Topics that averaged < 5/10 in the last five reports are flagged `weak_before`. Weights are normalised to sum to 1.
2. **Question count** — `round(duration / minutes_per_question)` clamped to 2–15, with 12 min per coding question, 15 per system design, 4 otherwise.
3. **Topic selection** — highest priority wins (ties → plan order):
   `priority = weight × (1.5 if weak_before else 1) × (1 − 0.6 × mastery/10) / (1 + times_asked)`
   where `mastery` is the mean score on that topic so far (unknown ⇒ factor 1). The same topic is not asked twice in a row when alternatives exist. This yields coverage first, then remediation.
4. **Difficulty (1–5)** — after each answer, `p = 0.6 × latest + 0.4 × previous` (or just `latest` for the first answer). `p ≥ 7.5` ⇒ +1, `p ≤ 4.5` ⇒ −1, otherwise unchanged.
5. **Follow-ups** — at most one per question, only if the evaluator requests one, the score is partial (3.0 ≤ s < 7.5), and the session budget `max(1, target // 3)` is not used up. Follow-ups do not count toward the question target.
6. **Question source** — an unused verified `question_bank` record matching topic/kind/difficulty is preferred; otherwise the AI writes an original question with hidden `expected_points` used for grading.
7. **Suggested next difficulty** — from the final difficulty and session score using the same thresholds.

Every decision stores a human-readable reason (`selection_reason`, `adjustment_reason`, `follow_up_reason`) shown in the UI.

## Resume practice score

The AI rates ten sections 0–10. The practice score is `10 × Σ(score × weight)`:

| Section | Weight | Section | Weight |
|---|---|---|---|
| skills | 15% | keywords | 10% |
| projects | 15% | achievements (measurable impact) | 10% |
| experience | 12% | role alignment | 10% |
| structure | 10% | education | 8% |
| certifications | 5% | ATS-related formatting | 5% |

It is **not** an official ATS score and does not predict selection. ATS formatting is judged from extracted text only.
