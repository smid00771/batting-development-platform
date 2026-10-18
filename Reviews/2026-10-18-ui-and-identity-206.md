# .206: clearer app UI, player identity and section navigation

Prepared locally; not published or applied to production. Includes the pending .205 current-season statistics foundation. The last authorised live release remains .204.

## Changes

- Added `app-design.css` as the common app presentation: readable typography, restrained club-colour accents, a white club header, consistent action/selected states and calmer card surfaces. Base and component CSS metadata now has a 12px floor; common buttons use 13px text and 44px targets.
- Updated Selection Board team sheets, mobile layouts, captain views, Match Review, Player Home, administration and social-editor controls. Overflow/gap warnings retain colour and text. Generated social artwork is not altered.
- Made main and Teams navigation horizontally scrollable on narrow screens; the active main section is kept in view. Existing desktop navigation can wrap.
- Added the missing global screen-reader-only label rule. Dismissal labels remain accessible without repeating full player names visibly. Removed redundant Match Review introduction and normal saved-history paragraphs; actual historical rows still carry their labels.
- Explicit section entry resets follow-up, selection comments, match conversation, statistics and nested editors. Back/Forward restores board expansions separately. Club Home, Training, Player Plan, Players, Innings and Messages use the same home-entry distinction. Club Home shortcuts, plain Player Home tiles and captain navigation inserted after sign-in now use the common route. Create posts also returns to its first step on re-selection. Explicit links to a particular match or task retain their destination.
- Fixed same-person confirmation for a pre-existing, unclaimed playing-list entry. The old function accepted only a deterministic scorecard-created placeholder. The new function also accepts an existing roster entry with no linked account, pending account invitation or batting-player history. Confirmation retains the original batting player ID, adopts the trusted scorecard name, records both identity links and repairs the current fixture when no genuine team transfer requires review. Previous publications are preserved. It does not merge two established player histories.
- Replaced the inaccurate “No app account is linked” message with an explanation of the missing player-record link. A player does not need a new signup to attach their score.

## Verification

The new synthetic database case reproduced the exact “linked to another club record” error under .204, then passed with the new migration. It covers an existing roster row both with and without a separate original Teams identity, blank email values, preserved IDs, canonical name, published selection, source score linkage, repeat confirmation, and rejection of another account or pending invitation. Existing identity and team-reconciliation SQL suites pass too. No real player records were read or changed for these tests.

Affected DOM suites cover repeated section clicks, away-and-return navigation, Back/Forward expansions, pending-save guards, captain permissions, conversation sending/retry, player-name confirmation, displayed scores, saved review editing, shared batting order, statistics controls and social workflow entry. App/demo parity checks pass. An initial new test used the wrong ordinary-player fixture and insufficient waiting for native details events; those harness issues were corrected.

CSS parsing and DOM checks verify hidden controls remain hidden, labels are visually hidden, common buttons have the 44px minimum, and the standalone demo contains the exact base/design CSS. JavaScript and embedded demo scripts parse. These checks do not establish rendered desktop or iPhone appearance. The Sites managed-runtime guidance requires its browser-control skill for browser QA; that capability is unavailable in this session, so no browser preview was started or claimed.

## Publication package

Apply these unapplied migrations with the frontend release, in order:

1. `20261017120431_current_season_stats.sql` — pending .205 foundation.
2. `20261017125457_confirm_existing_roster_identity.sql` — .206 identity repair.

`app.html` loads the new design stylesheet and .206 app cache version. `demo.html` embeds the same presentation and fictional adapters. No secret key or real historical score export belongs in the public repository.

Browser/device layout review remains required before calling the visual pass verified. Publication requires approval for this new release; earlier approval named .204. No live migration, repository push, deployment or external message has been performed for this package.
