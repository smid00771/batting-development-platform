# Source grade statistics and simpler fixtures — 0.8.62.322

Season stats previously split one grade when older fixtures carried a competition label and a later PlayHQ-linked fixture left it blank. The saved source links confirmed the affected rounds had the same PlayHQ season and grade IDs.

The scoped stats response now includes club grade and linked PlayHQ season/grade identifiers. Its read-only projection resolves a missing label from that exact source identity. Unlinked manual fixtures use an unambiguous club grade ID within the same season and format. Different source grades, source seasons and conflicting labels remain protected. Match figures remain separated by format; saved fixtures and scorecards are not rewritten.

The main totals and grade comparisons use the same resolution. An old selected blank-label grade follows its single resolved option. Grade dropdowns show the grade name alone when unambiguous. The normal fixture editor no longer asks volunteers for a competition. Editing the same grade preserves saved competition metadata; choosing another grade does not carry the old label across.

Validation:

- Stats regressions cover combined innings, batting average and strike rate, format separation, conflicting identities, manual fixtures, unchanged source objects, published lineups and the selected dropdown option.
- Existing stats UI, returning-player evidence, snapshot, fixture navigation and delivered-demo checks passed. Fixture creation and later edits still save with the competition input absent.
- Authenticated database role tests passed for Club Batting-only, linked products, scoped coaches/selectors and denied ordinary/outsider access. Source identifiers are returned only for authorized fixtures. The existing authenticated EXECUTE grant is retained; source/public/anonymous privileges are unchanged.
- A read-only check of the affected live club returned one First Grade group with four completed scorecards. The club-wide completed total remained 22, confirming no duplicate imports were added.
- Security and performance advisory counts were unchanged after the migrations.
- The generated demo was checked against the current source. The real fixture form was inspected in the browser on desktop and at 390px phone width, with no horizontal overflow. Screenshots remain private review artifacts.

The change adds no new provider requests, paid analysis, startup downloads or notifications. Source data that cannot establish a unique link remains unresolved.
