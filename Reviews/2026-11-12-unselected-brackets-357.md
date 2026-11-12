# Available, not selected — bracket partners (.357)

The list previously counted only the selected date's slot. A player bracketed for Day 2 therefore appeared unselected on Day 1, even though they already belonged to that fixture.

For a fixture played on the chosen date, the list now excludes players selected on either playing day. Availability still follows the chosen date. Cancelled/no-play fixtures and unrelated dates do not reserve players; current drafts determine selection. No saved selections, availability records, permissions, or clash rules change, and the list makes no additional requests.

Validation:
- Reproduced the Day 2 failure before the fix.
- 17 tests passed across bracket filtering, the actual demo selector journey, previous-team copying, and no-play handling.
- Covered both bracket partners, half-filled brackets, ongoing fixtures, draft removals, inactive/unanswered/unavailable players, and stale second-day slots on one-day fixtures.
- JavaScript syntax checks, generated demo consistency, and whitespace checks passed.
- Inspected the actual rebuilt demo at desktop and 390 px phone width; the unselected list displayed correctly and omitted both seeded bracket partners.

Release includes regenerated demo and cache/version updates to 0.8.62.357. No database migration is needed.
