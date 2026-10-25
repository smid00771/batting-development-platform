# Basic and Smart weekly awards — beta 0.8.62.269

Prepared for the existing Mirelion/Club Batting beta app and its role-based demo. David explicitly approved publishing and deploying both updates to the public smid00771/batting-development-platform repository on 26 October 2026.

## Team of the Week

- Two exclusive choices: **Use basic TOTW** and **Use smart TOTW**. Smart is the initial method; each account/club remembers its choice on that browser.
- Basic reserves the best all-rounder using runs + 20 × wickets, then takes six batters by runs and six bowlers by wickets/fewer runs conceded, skipping people already included. It offers 13 different people where enough performances exist. The club picks its XI; Basic does not preselect it.
- Smart keeps the existing match-context scoring and explanations. Each method keeps its own draft XI for the current week/scope, reconciled against refreshed scorecards.
- Compact phone rows, collapsed method explanations, existing saved editions and the verified image-saving path are retained.

## Player of the Week

- **Use basic POTW** ranks runs + 20 × wickets. Equal combined totals use wickets, runs, then fewer runs conceded. Missing conceded figures are not zero. History, grades and recent winners do not change Basic rankings.
- **Use smart POTW** keeps the existing scoring engine: batting pace relative to the rest of the match, bowling economy and wicket-taking rate relative to the rest of the player's own attack, innings share and completed-chase contribution. No independent opposition-strength rating has been added.
- Offer five leading people where available, retaining equal scores at the cut-off. Smart retains the existing extra options for batting, bowling, all-round contributions, grades and recorded player context. Different matches do not add together or give one person multiple shortlist places. All performances stay available.
- A **Stand-out** badge identifies one to three closely matched leaders only when their scores are at least 60 and the gap to the next scored person is at least 12 points and 20% of the last leader's score. Leaders must also lie within 12 points or 20% of the first leader. This is a transparent comparison guide, not a calibrated probability or automatic winner.
- Both methods leave the winner to a person. Switching preserves the selected winner, photo and caption. Score refresh follows the same player/team/match across changed snapshot keys; an absent performance or changed award scope clears the draft choice. Existing saved awards remain intact.

## Verification

99 regression checks passed across the final set of 17 test files, covering both ranking methods, both delivered award screens, image save/download/retry and history, Day 1, scopes, week navigation, simulated publishing and demo role permissions. The first combined run passed 96 checks and exposed one old test importing a module from the removed Website_Files directory. Correcting that test to the current source path made its three checks pass; production code was unchanged by that correction. New coverage verifies raw-versus-context ordering, ties, missing figures, repeated players, no forced stand-out in close contests, manual selection, pending-save locks, refreshed scores and separate account/club preferences. Syntax, whitespace and generated-demo freshness checks also passed.

The rebuilt demo was inspected in Chromium at 1440px and 390px. Both POTW controls fit on one phone row with 47px label targets, no horizontal overflow and no browser errors. Switching methods retained the chosen winner. The earlier TOTW desktop/phone inspection was also reviewed.

## Publication

Publish the app, demo, source and test changes together as 0.8.62.269. No database migration or server function deployment is needed. GitHub Pages deployment status is recorded on the release pull request.
