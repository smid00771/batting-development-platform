# Available-again reminders — .360

A returning player was omitted when the next grade fixture changed from limited overs to long form. The reminder required an exact format match, so it could not find the saved unavailable game or the confirmed selection before it.

Limited overs and long form now share returning-player history within the existing grade and season checks. T20 retains separate history, and a T20 appearance cannot be mistaken for an intervening move in the continuing grade competition. Statistical comparisons still keep their existing format-specific samples.

The quiet reminder uses the existing loaded selections and saved availability. It retains explicit unavailable-versus-unanswered dates, confirmed previous selections, cancellation/no-play handling, day-specific availability, overlap checks and cached board redraws. Selecting the player removes the reminder, and Undo restores it. No database migration, additional request, polling or live selection edit was needed.

Validation: 60 tests passed across returning-player logic, quiet board reminders, delivered-demo selection/Undo, analysis snapshots and comparison UI. New regressions cover all LO/long-form/T20 transitions, an absence spanning the change, separate T20 appearances, the latest unavailable game and both playing dates. A read-only reproduction using the reported saved fixture/availability records returned no reminder before the fix and the expected reminder after it; the current already-selected state correctly stays hidden. Real player records are not included in this repository.

The rebuilt demo's collapsed and expanded reminder was visually checked on desktop and at 390-pixel phone width. JavaScript syntax, demo reproducibility and Git whitespace checks passed. Updated module URLs ensure the app and optional comparison path load the same correction.
