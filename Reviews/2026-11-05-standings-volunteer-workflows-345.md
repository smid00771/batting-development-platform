# 0.8.62.345 — Club standings and volunteer workflows

The four approved ideas ship together: competition ladders and a configurable Club Championship, pasted unavailability with reviewed name matches, usual teams maintained from published selections and confirmed results, and marketing focused on the time saved preparing club socials.

## Player experience and access

- Player Home gains one `Club standings` text link in its existing links row. No new task tile or startup standings request.
- Season stats contains Ladders and Player stats for authorised staff. Staff retain their existing Player stats starting view; ordinary members receive only public standings. Selection context, roster details and private player statistics are not requested by the standings view.
- Ladder and Championship audiences are independently configurable as members/staff, with Championship also supporting Off. Settings remain admin-only.
- Championship initially shows the club position and points. The full table and each club's contribution breakdown expand on demand. Competition and format changes use the saved response without a network request.

## Data and update policy

- Public PlayHQ ladder endpoint, published column keys, and official team/organisation IDs determine the totals. No name-based club matching. Some season directories omit ladder teams: a bounded public fixture/summary fallback recovers their exact club IDs without retaining player appearances.
- Automatic checks use the existing server worker, a shared season/grade cache and leases. Regular checks occur every four hours. Changed results can bring the next check forward, throttled to at most once per 30 minutes. Directory/catalogue discovery is daily. No provider checks run on navigation, returning to the app, or changing dates/grades.
- Displayed data has update times. Incomplete identities, points or competition data suppress Championship rankings; provider failures retain the last saved table and do not disable result ingestion.
- Overall points are counted once, without adding the already included adjustments or combining overall and format totals. Settings support multipliers, format/points columns, sum/average/best team aggregation, minimum teams and total/per-team calculations.
- City's nine source competitions use the approved weights: 1st 5, 2nd 4, 3rd 3, 4th 2, Development 1, Women's 1st 3, Women's 2nd 2, Gilmour 2 and SG Moore 2. Both Development teams contribute. Other associations can change the settings without code changes.

## Availability and usual teams

- Paste unavailable players is optional beside the existing date workflow. Unique exact names are selected automatically; shortened or ambiguous names need an explicit choice. Unknown names can be matched or skipped. Duplicate matches save once.
- The save covers only the reviewed active players and selected dates, checks roster/calendar revisions, and uses a receipt for lost-response retries. All changes are atomic; other players, dates, recurring settings and blocks stay intact.
- Usual teams update after evidence changes, never on navigation. Drafts do not count. Completed scorecards replace published selections only when every identity is resolved. Two-day appearances count as one fixture; separate same-day games remain separate fixtures.
- Manual choices and deliberate removals remain respected. After three played fixtures, current-season frequency and recency lead the ordering. Corrections remove inferred evidence without deleting manual choices. Club-level deferred refresh runs once per transaction, plus the daily season-rollover check.

## Marketing

Mirelion Select now leads with selection through results and club socials. Newcastle City's reported results-post time reduction from at least 40 minutes to under five is attributed to the club, with varying outcomes acknowledged. Copy covers automatic TOTW/POTW collation, optional milestone alerts, and using the facts in a club's own artwork.

## Verification

- 89 targeted checks passed across PostgreSQL permissions/transactions, provider normalisation and worker isolation, name matching, demo workflows, player Home, availability, usual teams, role navigation and same-day scorecards. The final identity fallback/provider subset passed 29 checks.
- Three live synthetic suites passed using actual authenticated roles: the new workflows, existing admin publication/scoped availability, and shared-statistics product/role scopes. Deferred triggers were exercised; every synthetic change rolled back.
- Demo regenerated from app 0.8.62.345; freshness, JavaScript syntax and whitespace checks passed. Browser QA covered the actual demo at 390px: existing Home layout, standings link, collapsed/expanded Championship and reviewed paste-to-save. Desktop marketing layout also checked.
- Live PlayHQ worker version 14; all 11 linked competitions cached successfully. Four omitted directory identities resolved through public match summaries. City configuration returned complete standings: 348 points, first of 16 contributing clubs at verification, with 26 Development points from two teams.
- Initial usual-team backfill produced 308 fixture/player evidence records. Roster count stayed 134 and fixture count stayed 122. Before/after hashes confirmed all fixture data and roster fields other than usual-team fields/timestamp unchanged.
- Supabase advisor comparison found no new security/performance warnings or unindexed foreign keys. Six new private tables intentionally have RLS with no client table policies; access goes through scoped functions. New-index usage notices are expected immediately after creation.

Backend migrations: `20261105034650_club_standings`, `20261105034856_automatic_usual_teams`, `20261105034920_paste_unavailability`. GitHub publication is one combined release commit. No real availability calendars were changed during verification.
