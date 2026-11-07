# Beta 0.8.62.351 — flag both playing dates and restore message phone delivery

Availability now flags two-day fixtures with both playing dates. The bulk form follows the selected teams and date in both Everyone available, except and individual-player modes. Individual calendars use already-loaded fixtures; the optional player fixture finder shows both dates before choosing availability. Each date retains its own saved choices. These hints add no fixture requests, and unrelated dates stay compact.

Copy previous team now names the playing dates with unconfirmed or unavailable players. When nobody can be copied, the explanation appears beside the button, receives focus and says when both days are required. Availability and existing drafts remain unchanged. Unexpected copy errors also receive a visible response. Successful copies, cross-format selection, Undo, concurrent-save protection and safe retry keep their existing behaviour.

The phone worker previously waited for email and coaching collection before collecting or delivering club messages. A failure in those scans therefore prevented century and five-wicket messages from reaching the phone-delivery stage. The worker now commits club-message collection and delivery first, independently of those scans. Existing opted-in devices, unread-message requirements, seven-day eligibility, corrected-score checks, current recipient permissions, leases, retry limits and duplicate prevention remain in place. Health checks remain read-only.

Verification:

- 21 focused tests passed, including the actual demo copy button, second-day-only missing availability, both-day copying, Undo, concurrency and retry; six of these exercise the phone worker with simulated delivery endpoints and a failing coaching scan.
- 43 availability regression and delivered-demo checks passed, including date/team scope, both days, saved exceptions, calendar status cycling, lazy fixture loading, unchanged second-day availability and return to the original Selection Board slot. Older isolated test harnesses now include their existing helper dependencies.
- A local PGlite PostgreSQL test uses fictional clubs, actual service-role calls through the public worker RPC, current phone schema constraints and the achievement trigger. It fails against the previous worker and passes after the migration. It covers centuries, five wickets, revoked Socials Manager access, opt-outs, disabled/new devices, corrected-away achievements, club isolation and deduplication. It has no network access.
- Application syntax, generated-demo freshness and whitespace checks passed.
- The delivered demo was checked in the browser at desktop and 390-pixel phone width. Selecting 2nd Grade and 14 November shows the 14/21 November warning below the team choice; it wraps within the phone screen and the save actions remain reachable.
- The additive database migration and phone-notifications version 7 were deployed. Readback confirms the new message actions and service-only RPC access.

No real test notifications were manually dispatched. Provider acceptance does not establish that a notification was displayed on a physical phone. Existing coaching collection may still report its own failure, but it cannot roll back or prevent the completed club-message stage.
