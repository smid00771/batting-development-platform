# Volunteer workflow review — 15 October 2026

## Aim and evidence

Remove repeated work and make each task clear to a volunteer who rarely uses a computer. Keep the current item, its actions and its help together. Save vertical space by hiding secondary detail, not by shrinking essential text.

Five parallel reviews covered navigation, selections, social graphics, player/coaching tasks, and administration/onboarding. A sixth checked whether a rendered local walkthrough was possible. Findings below come from source inspection and isolated DOM/runtime checks with sample data. No live club records were changed and no messages or social posts were sent.

A full visual or signed-in walkthrough was **not completed**: the local browser executable was unavailable. Spacing findings are therefore identified as source-based and need rendered confirmation. Existing live Player of the Week undo was separately verified against the deployed files.

## Fixes prepared in this branch

| Problem | Change |
| --- | --- |
| Some selection Back buttons never received the history handler. | Missing buttons no longer stop the remaining buttons from being bound. |
| Saved match review Back could return to a fixed destination. | Corrected the button identity and used the existing previous-view navigation, including direct renders. |
| Opening a locked fixture could crash when no unlock control was available. | Bound the optional control safely, retained Back, and corrected the published-team label. Publishing authority is unchanged. |
| A slow fixture conversation or review response could replace a newer view. | Ignore responses after leaving that view or opening a different fixture. |
| Failed automatic copying left nothing usable to copy. | Show and select the actual text for manual copying when the clipboard fails. |
| Edit roles opened coaching duties instead. | Focus the person's actual role control or protected lead summary. |
| Failed sign-up changes left a misleading button label. | Restore the prior Open/Close sign-up action on failure. |
| An optional, unsaved innings reflection could not be cleared once started. | Add Clear reflection answers only when needed; retain the score, other innings details and save protections. Saved reflections are not deleted by this action. |
| Reloading Team of the Week scores discarded the chosen XI. | Reconcile the chosen performances by match/team/player identity, retaining order and figure choices while refreshing facts. Missing performances are flagged instead of silently replaced. |
| Reloading scores replaced unsaved artwork changes. | Preserve dirty Team/Player of the Week layouts and their original revision so another editor's work cannot be silently overwritten. |
| Background help started again from an old example despite a saved background. | Default to editing the saved background. Offer Start from previous example separately when both exist, and retain relevant overlay choices during an edit. |
| Changing the Team of the Week date retained the old week's caption. | Clear that caption on an explicit week change. |

Production and embedded demo implementations are kept aligned. The focused verification covers navigation, selection locks and stale responses, admin recovery, innings reflection, and Team/Player of the Week flows. There are no database or service changes in this batch.

## Resumed release verification — 16 October 2026

Recovered the unfinished work and independently reviewed it in an isolated checkout. All 56 relevant checks passed, including navigation, locked fixtures, stale responses, admin recovery, reflection clearing and weekly awards. The weekly award UI test now uses an explicit starting week, avoiding date-dependent failures. Production modules and embedded demo are aligned; JavaScript syntax and diff checks passed. Verification used simulated UI and source review, not a full authenticated browser walkthrough. Website release: 0.8.62.188.

## Priority 1: connect fixtures once, remove weekly entry

This is the largest recurring administrative job identified in this review. Automatic discovery and scheduled refresh are new work; the current scorecard importer requires an already-known match link and rejects upcoming matches.

PlayHQ's official [API guide](https://support.playhq.com/hc/en-us/articles/23949453276572-How-To-Use-PlayHQ-API-s) documents public fixture access, visibility rules and credentials. Club/league access is requested through the association; publishers use the relevant sport's contact route. Public endpoints still require an API key/client ID and the Cricket Australia tenant (`ca`). Approved access, commercial use scope and refresh limits must be confirmed before committing to a refresh interval. No approved Mirelion fixture credential or working fixture-discovery request has been verified in this review. Private partner endpoints are not assumed available. PlayHQ also [documents Game Summary webhooks](https://support.playhq.com/hc/en-us/articles/23976170888476-Live-Scoreboard-Integration) triggered by association changes to venue, date or time; these require separately arranged partner access. Participant calendar sync is not evidence of an approved server-side commercial feed.

Proposed volunteer flow:

1. **Connect PlayCricket fixtures** in club settings.
2. Confirm the matching team, competition and season for each club grade once.
3. Upcoming fixtures appear automatically with their supplied dates, times, opposition and grounds.
4. A compact **Last checked** status shows freshness. Meaningful changes need attention; successful checks do not create extra work.
5. Keep **Add fixture manually** as a secondary option for friendlies and unavailable feeds.

The same fixture identity can then serve availability, selections, published team details, match preparation and social creation. Linking imported results to those fixtures could remove another repeated matching step later.

### Existing implementation boundaries

`Functions/playcricket-scorecard/index.ts` has a bounded server fetch for a known Australian match UUID. Its normaliser in `scorecard.mjs` rejects upcoming matches. Reuse its identity and request-safety patterns, but implement fixture discovery and upcoming-fixture normalisation separately. The current single-match request does not establish permission or reliability for scheduled bulk discovery.

`seFixtureEditor()` stores one ground and at most two playing days; `d1`/`d2` slots carry bracket selections. Confirm timezone semantics and preserve day identity before applying source dates. Existing correction functions coordinate changes with linked preparations, innings and reviews. Read their deployed definitions before implementing the sync worker.

### Required behaviour

| Change or failure | Handling |
| --- | --- |
| Date changes | Update by stable provider match ID, preserve the internal fixture and selected players, and recheck availability for the new date. |
| Existing manual fixtures | Offer an initial match/link step to avoid duplicates. |
| Two club sides in one competition | Match the actual team, not merely the club or grade name. |
| Venue/time change | Retain club meeting instructions and intentional local overrides; show the old and new official details. |
| Multi-day changes | Preserve each day's identity and selection brackets. Do not reorder selections merely because the source order changes. |
| Published selections | Stage changes for review and the existing republication process; do not unlock or choose players automatically. Consider separating refreshable official fixture facts from the locked selection snapshot. |
| Cancellation or missing fixture | Distinguish explicit cancellation from a feed outage or missing response. Never delete on one absence. |
| Completed match with linked records | Use existing correction protections and reviewed changes. |
| Feed failure | Keep the last good fixtures and show the last successful check. |
| Repeated changes | Consolidate them into one pending update; prepare revised notices/graphics for review. |

Use a central refresh job with bounded retries and shared caching, not a new crawl every time someone opens a page. The existing scorecard worker provides useful identity and HTTP-safety patterns, but needs a separate upcoming-fixture normaliser. It currently drops start times. The original fixture schema/correction definitions and discovery worker are not present in this checkout, so backend readiness requires further inspection before implementation.

## Priority 2: finish a post without restarting work

| Finding | Next change | Evidence |
| --- | --- | --- |
| Confirmed century/5-wicket graphics leave the creation list but cannot be revised there. | Provide Edit/replace from the collection, preserving an already-published original. | `social-awards.js` and award RPC migration; source-confirmed. |
| Results can confirm multiple images while previewing only the first four grades. | Review every image with Image 1 of 2 navigation before confirmation. | `social-awards.js`; source-confirmed. |
| Results uses a fixed renderer that cannot reproduce every club's reference theme. | Make example-derived layouts reusable, with supplied backgrounds taking priority and current facts remaining authoritative. | Existing renderer and reported examples; still unresolved. |
| Importing scorecards from Player of the Week or awards sends the user to Team of the Week. | Open a focused import step and return to the original task. | Social navigation callbacks in `app.js`. |
| A saved Team/Player of the Week graphic joins the collection without a clear handoff. | Offer Review award post after saving. | Module save flows and collection integration. |
| Team of the Week shows overlapping selection lists and layout detail. | Lead with Your XI; collapse rankings/explanations and expose close choices when needed. | Module markup; rendered spacing confirmation needed. |
| A collapsed layout panel sits beside a tall team-artwork preview, with Next below the grid. | Keep the main action close to the working area and avoid the empty column. | `social-team-workflow.js`; source-based spacing finding. |
| Some empty status/copy elements still reserve room. | Hide those specific empty elements, without a blanket rule that hides useful feedback. | `.st-preview-status` and social markup; source-based. |
| Changing weeks can still lose draft layout work; Back restores only part of week state. | Preserve drafts per week, or explicitly offer to keep/discard them. | Team/Player of the Week state handling; not fixed by the reload changes. |

## Priority 3: show the current task first

| Area | Finding and next change |
| --- | --- |
| Published teams | Add a fixture-date selector; the current list mixes dates and shows all published fixtures newest first. |
| Captain checks | Separate current work from historical reviews. |
| Published views | Extend freshness handling to read-only Teams and Captain Checks; current polling is concentrated on the board and conversations. This does not itself prove any publication failed. |
| Navigation | Extend previous-view state to availability dates/player, conversation date, roster filters and picker context. The current fixes do not solve every Back journey. |
| Selection controls | Match captain/keeper control size to the other usable mobile controls. |
| Selection role information | Keep publishing responsibility near publishing decisions; remove repetition on unrelated selection settings pages after checking role-specific needs. |
| People and sign-up | Provide a product-relevant route to selection responsibilities for Teams-only clubs. Do not merge unrelated permission systems. |
| Invitations | Move the large QR/instructions into a secondary disclosure so current roles are visible sooner. |
| Admin text | Replace 9–10 px essential copy with readable text and shorter wording. Confirm layouts at phone sizes. |
| Club home | Once setup is complete, lead with current jobs and exceptions; collapse setup education. |
| Membership counts | Distinguish a player on the club list from a member with a linked account. |
| Training check-in | After someone asks to speak with another person, offer the relevant conversation action; recording the preference is not the same as contacting anyone. |
| Optional video | Collapse optional video fields and help until needed, opening automatically when a saved video exists. |
| Player plan | Show repeated answer instructions once; make optional free text an Add my own answer action rather than an empty box on every question. |
| Bowler feedback | Show general sharing instructions once, retaining only relevant per-item context. |
| Predictions | Reuse the existing upcoming fixture when unambiguous; otherwise ask Which match? before requesting manually entered match details. |
| Public demo | Replace the long flat scenario list with a few volunteer journeys and More examples. Demo navigation currently replaces history rather than recording every Explore view. |
| Product explanation | Once ready, demonstrate the recurring work removed by selections, meetings and social graphics on the public Teams page. |

## Product direction: less weekly work

1. Connect fixtures once and reuse the data everywhere.
2. Make one club example and shared branding reusable across weekly social posts; retain player photos/cut-outs and easy corrections.
3. Resume unfinished weekly work in the right place, with a clear next action and undo where appropriate.
4. Offer contextual help using the current page, selected match and permissions rather than making volunteers explain their situation again.
5. Build the agreed selection evidence review before proposed teams or detailed match-up analysis. Existing availability and conflict checks remain the foundation.

AI can help with artwork interpretation, quality checks and concise evidence summaries. Official match facts, permissions and publishing decisions retain their existing authorities. New features should remove work rather than add another setup or review chore.
