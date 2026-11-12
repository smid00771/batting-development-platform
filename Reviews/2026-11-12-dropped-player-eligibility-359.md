# Dropped-player eligibility — .359

Moving from limited overs to long form previously produced no dropped-player reminders because the comparison required identical formats. Both formats now share the latest completed round within the existing competition/selection group and season. T20 keeps its separate comparison history. Both members of a bracketed pair remain included.

A lower-grade placement caused by recorded unavailability is excluded when the player cannot meet the higher grade's current playing dates. The check uses the higher fixture's actual dates, including differently scheduled weekends. General bracketing permits part availability; a representative-duty-only exception does not give every player that permission. Missing or ambiguous higher fixtures do not invent an availability explanation.

Fixture details now offers “Generally permitted” and “Representative duty only” when bracketing is enabled. Saving this setting preserves both selected players and supports the existing Undo and retry flow. Existing fixtures retain their general-bracketing behaviour until deliberately configured otherwise.

The same eligibility check applies to newly captured and saved reminders. Shared spoken-to status, prior-captain permissions, confirmed scorecard identities and explicit capture remain intact. Ordinary page reads do not rerun the historical comparison, and player startup gains no requests.

Validation: 55 Node tests passed across actual-lineup comparisons, saved reminders, fixture recovery and bracketed unselected lists. The new database regression and both existing dropped-player database regressions passed using transaction rollback and actual authenticated-role RPC calls. Coverage includes LO/long-form transitions, T20 separation, latest-round anchoring, season/competition isolation, both bracket partners, representative-only eligibility, higher-fixture dates, saved status, retries and permission denial.

Desktop and 390-pixel phone-width fixture editors were visually checked. JavaScript syntax, demo reproducibility and Git whitespace checks passed. Both database migrations were applied and read back; security advisors reported no new findings. Live eligibility now excludes the availability-forced placements while retaining the eligible lower-grade reminder. The affected fixture's representative-only setting was corrected without changing its slots or published snapshot.
