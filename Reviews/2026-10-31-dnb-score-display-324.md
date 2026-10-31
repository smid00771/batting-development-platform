# Match Review DNB prompts and batting figures — 0.8.62.324

Two already saved DNB players were incorrectly counted as updated scores: the provider represented `not_out` as null while the saved innings returned false. Match Review now ignores that inapplicable field for DNB when comparing scores. This removes the false header count, import action and associated save instruction. New scores and real changes, including transitions between batting and DNB, still require the existing review/save flow. No saved results or database definitions are changed.

The score column now has a wider, aligned row of Runs, Balls, SR, 4s and 6s. Runs remain prominent, not-outs retain their asterisk, strike rate uses two decimal places, and missing figures show a dash. DNB stays a simple DNB label. On phones, the figures sit in one row beneath the player and above the assessment controls.

Validation:

- Read-only inspection confirmed the false/null mismatch for both reported saved DNB results.
- Regression checks exercise both the live source and generated demo: no false DNB actions, no selected DNB imports, and retained genuine corrections. Figure checks cover not-outs, missing values, zero-ball innings, boundaries and SR.
- 32 targeted checks passed across identity/import UI, scorecard rows and order, automatic batting scores, review entry, completed-scorecard eligibility, and shared captain/coach observations. The identity harness now supplies its existing arrival/replay dependencies; the database eligibility test used the already installed PGlite dependency.
- Browser inspection at full laptop width, a 960px viewport and a 390px phone viewport confirmed readable figures without horizontal overflow. Phone assessment buttons retain at least 44px touch targets.
- Generated-demo consistency, JavaScript syntax and diff checks passed. No new data requests, paid services or backend changes.
