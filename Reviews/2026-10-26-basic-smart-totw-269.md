# Beta 0.8.62.269 — Basic and Smart Team of the Week

Clubs can choose **Use basic TOTW** or **Use smart TOTW** in the existing suggestion toolbar. Smart remains the initial method; the browser remembers the chosen method separately for each account and club. Switching keeps each method's draft XI for the current week and award scope. Restoring a draft reconciles its players against the latest selected scorecards. Changing weeks or scope clears the old drafts.

Basic offers 13 different people where the available performances support all three categories. Reserve the best all-round performance first, using runs + 20 × wickets and requiring a positive contribution in both skills. Then take six batters by runs and six bowlers by wickets, breaking equal wicket totals by fewer runs conceded, skipping people already included. Multiple matches cannot give one person two places. Missing conceded figures are not treated as zero; identical figures use stable source-key ordering, and all performances remain available for a human decision. A quiet week can yield fewer than 13, without invented players or contributions.

Basic does not preselect an XI or offer automatic confirmation: the club ticks its 11. The shortlist uses compact rows, and refreshing it keeps those choices. Both modes retain the existing verified image-saving path, exact source figures, award scopes, Day 1 options and saved editions. The optional example cannot influence Basic's rankings. There are no database changes. The subsequently requested Player of the Week addition is described in 2026-10-26-basic-smart-awards-269.md.

Smart's scoring implementation is unchanged. Its collapsed explanation now gives the 3/30 versus 3/14 example and describes the recorded comparison with team-mates. Smart does not separately rate opposition strength, infer pitches or give grades automatic weighting. Basic's explanation discloses its role counts, ordering, all-round formula and duplicate handling.

## Verification

- 87 checks passed across Basic ranking, the existing Smart match-context guide, both delivered award screens, Team of the Week image saving, award scopes, Day 1, publishing, recovery, week navigation and demo role permissions. The image test includes Basic's 13-player shortlist, 11 manual picks, successful save, unchanged prior editions and restoration of the separate Smart draft. Social posting was simulated.
- Focused UI checks passed again after the compact Basic rows were added. Score reload retains the chosen XI and updates its figures and source keys. Pending image saves lock the method controls. A new account/club starts with Smart; a new week cannot restore an old XI.
- The generated demo was inspected in Chromium at 1440px and 390px. Both method controls fit on one phone row with 47px label targets; the page has no horizontal overflow and no browser errors. Basic candidates use compact rows. The expanded Smart help explains the comparison without adding routine page height.
- App/demo version is 0.8.62.269, with 45 shared demo modules. Syntax, whitespace and generated-demo freshness checks passed.

David explicitly approved publishing and deploying the combined Team and Player of the Week update on 26 October 2026; see 2026-10-26-basic-smart-awards-269.md.
