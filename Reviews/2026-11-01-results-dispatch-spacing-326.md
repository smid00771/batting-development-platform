# Automatic result dispatch and Results spacing — 0.8.62.326

The reported missing century alert was caused by the club's milestone-alert switch being off; enabling award graphics does not enable notifications. The recorded innings qualified. The requested club setting is now enabled from the change time, without backdating it or creating historical notifications.

The result scheduler was active and successfully importing completed scorecards. Two reported grades had automatic imports; several manual checks preceded their estimated finishes. The existing start/overs/timezone estimates are retained. A separate throughput problem meant only one due job ran every five minutes. The scheduler now dispatches up to eight already-due eligible jobs, prioritises results, and avoids issuing another batch while its tokens await workers. It retains one-use tokens, separate row leases, active-season/product/connection checks, future due times, error backoff and slower correction checks.

Missing scorecards show their next automatic check through the existing authorised fixture read. Completed results gain no extra status text, polling or source download.

In Results artwork, side-column totals incorrectly reserved space beneath the central grade ribbon. This pushed the player lines down and shrank their type. Scores now respect the saved high position, leaving room for readable names and figures. The requested club layout also lifts its header logos and adjusts the visible player type modestly. Artwork, match facts, result lettering and saved graphic files are preserved; newly created graphics use the correction.

## Verification

- Bounded-dispatch regression covers eight-job cap, simultaneous result priority, distinct leases, replayed-token rejection, repeated scheduler calls, paused/inactive clubs, old seasons, future jobs and provider backoff. Worker calls run under the service role; client execution is denied.
- The full migration and fixture RPC passed against the actual authenticated role inside a rolled-back live transaction before deployment.
- Existing post-match achievement tests cover opt-in, completed-only detection, recipients, exact-award navigation, corrections, retry and historical exclusion.
- Fixture UI tests verify club-local times, old responses, a single saved-score read and no source request or scheduling clutter for completed results.
- Renderer tests cover compact shared-opponent layouts, typography, scores, logo clearance, margins and mixed opponents.
- Startup, award workflows, complete demo navigation and role tests passed. The rebuilt demo was visually checked on desktop and at 390px width. A separate rendering at the reported graphic width verified the requested spacing with fictional content and the same saved geometry.
- No new security or performance advisor findings; pre-existing findings remain.
- No paid AI or video requests, social publication, FrogBox submission or historical notification backfill is part of this release.
