# Mirelion public launch requirements

Decision recorded 21 October 2026. These requirements govern the wider public launch after Newcastle City's beta. A beta deployment does not establish public-launch readiness.

## Settled structure

- Mirelion is the umbrella business and leading website brand.
- Club Batting retains its product name.
- The teams, availability and selection product has a separate product entrance. Its final brand name remains unresolved; Mirelion Select is a candidate only.
- One Mirelion-led website presents both products with dedicated product pages and one shared sign-in.
- Clubs can use either product independently or both together, adopting them in either order. Shared club/player information is entered once.
- Existing Club Batting addresses and app access must have a deliberate migration/redirect plan before any domain change.
- Keep the established compact interface; branding must not add repeated headings, banners or page height.

## Release evidence required

| Area | Acceptance condition | Current evidence / outstanding work |
| --- | --- | --- |
| Product identity | Approved second product name; consistent Mirelion/product naming across website, app, installation, invitations, help and transactional messages. | Structure agreed. Second name and implementation outstanding. |
| Website and domains | Two clear product journeys, shared sign-in, correct existing links and redirects; return URLs work on supported domains. | Existing Club Batting site remains in place. Domain ownership and routing need verification before changes. |
| Standalone and combined clubs | A new club can start with either product, add the other later, retain its people/branding/history and see only its authorised products. | Must run and record the complete journeys using separate test clubs. |
| Roles and Selection Groups | Server-enforced no-access/view/edit boundaries; additive captain/coaching/social roles; safe invitation acceptance and Head Selector handover; no group left without publication authority. | .246 prepared with 60 focused integration checks and five full-schema SQL suites passed in a rollback transaction. Deployment and live provider removal/rejoin verification remain outstanding; see `2026-10-21-selection-group-permissions-246.md` and the companion call-revocation review. |
| Club Batting participation | Only opted-in groups send new data to Club Batting; controls hidden without the product; opt-out preserves history and another participating team's batting work. | .245 server write guards are live and verified. The compact frontend controls are prepared; website publication is pending. See `2026-10-21-automatic-results-245.md`. |
| Fixtures, results and identities | Automatic updates, late corrections and missing details preserve selections/history; shared scorecards remain consistent; identities never merge from names alone. | Existing beta evidence is partial. Check representative completed, incomplete, two-day and corrected games. |
| Trials and billing | Clear product/bundle prices, trial start rules, entitlement changes, cancellation and payment confirmation; correct business identity. | Final launch choices and end-to-end evidence required. Do not infer readiness from an existing payment link. |
| Social connections and posting | Correct business/app identity, role access, token/permission failure handling and explicit post review. | End-to-end multi-club evidence required. |
| Phone and desktop use | Real user journeys have no dead ends, unnecessary scrolling, clipping or misleading saved states; sign-in and return navigation work. | Beta feedback ongoing. Automated DOM checks alone do not establish visual acceptance. |
| Support and operations | Consistent contact/help/privacy/terms text, recoverable failures, backup/restore evidence and visible operational ownership. | Inventory and verification outstanding. |

## Launch decision

Public launch is blocked while the product name, coherent website/product journeys, scoped permissions and the evidence above remain unresolved. Complete and link focused reviews as work finishes. Newcastle City's ongoing beta is the proving ground, not proof that every club configuration is ready.

## Public-launch journey checks

These are required scenarios to execute and record, not claims of completed testing. Use synthetic clubs and accounts; never experiment on a real club's payments, published teams or messages.

| Scenario | Required result |
| --- | --- |
| Start with teams only, then add Club Batting | One club and playing list; shared branding retained; batting access starts only with its entitlement and chosen Selection Groups. |
| Start with Club Batting, then add teams | Existing plans/history remain attached to the same people; selection roles are explicitly assigned; no duplicate accounts or club setup. |
| Person holds captain, workshop and socials roles | Capabilities add correctly without granting selector access or exposing another group's private selections. |
| Two groups have different Heads | Each Head can publish their own group independently; view-only cannot edit; club Head can relinquish one group only with an atomic replacement. |
| Revoke access with an old tab and active call | Subsequent reads/writes/admission fail appropriately; the provider removes affected call participants; unaffected groups and call credit accounting are preserved. Record provider-failure behaviour. |
| Toggle Club Batting off and on | No new coaching data or plan reminders while off; existing records retained; players in another opted-in group retain that group's batting access. |
| Import, correct and republish | Delayed results, Day 1 figures, venue/date changes and name discrepancies follow the existing review locks without duplicate players or lost selections. |
| Subscribe, expire, cancel and retry payment events | Correct product access and confirmations; duplicate events never duplicate credit/entitlements; wrong-club events cannot alter another club. |
| Use an installed app or an old invitation after domain migration | Correct shared sign-in and product destination; existing sessions, subscriptions and deep links recover clearly without losing club identity. |
| Act from another club or with an expired role | Private data and writes remain isolated on the server, including direct requests and remembered identifiers. |

## Current source audit — 21 October 2026

Source inspection only; this does not verify live service configuration, delivery or payments.

| Surface | Current implementation | Required launch work |
| --- | --- | --- |
| Public website | `index.html`, `batting.html`, `teams.html` already provide two product pages and a shared `app.html` sign-in, but headers, footers, metadata and the cricket icon brand the whole business as Club Batting. | Make Mirelion the shared website identity; keep Club Batting as a named product. Complete the second product name before final copy. |
| Trial and account entry | `enquire.html` forwards product choice into `renderProductTrialEntry` in `app.js`; it supports either product/both, existing clubs, email confirmation and chosen trial dates. Its surrounding identity still says Club Batting. `PRODUCT_ENQUIRY_LABELS` names the batting product “Batting development”. | Apply the umbrella/product distinction consistently; exercise new and existing account returns for each product and both adoption orders. |
| Installation and notifications | `app.html`, `manifest.webmanifest`, `offline.html` and `sw.js` label the shared app Club Batting. Manifest icons are cricket-specific. `sw.js` always uses the notification title Club Batting and reduces other notification bodies to a coaching update. | Agree the shared app identity and assets; verify a Teams-only club receives accurate product-neutral notification language and install/offline screens. Preserve installed-app identity and existing subscriptions during migration. |
| Domains and external return paths | `CNAME` and marketing canonical URLs use `clubbatting.com`. `Functions/playhq-sync/index.ts`, `Functions/playcricket-scorecard/index.ts` and `Functions/selection-video/handler.mjs` allow only Club Batting origins. Social publishing defaults to a Club Batting callback; calendar links accept only that origin. | Verify the selected Mirelion domain before changing it. Reconcile origin allowlists, Meta callback/configuration, authentication redirects, calendar and existing deep links as one migration. Do not replace strings blindly. |
| Subscription journey | `renderScheduledClubProducts` explicitly says online payments are disabled during the pilot. Video top-ups have a separate verified webhook in `Functions/selection-video-payments/handler.mjs`; that does not implement product subscriptions. | Settle product/bundle pricing and verify purchase, entitlement, expiry/cancellation and confirmation paths independently of top-ups. Check the customer-facing business identity in live payment configuration. |
| Social authorisation | `social-connect.html` and `social-connect.js` tell users to return/sign in to Club Batting. `Functions/club-social-publish/service.ts` has configurable Meta redirect/origin defaults. | Align the website, callback page and externally approved Meta identity without disrupting existing club connections. Live Meta settings were not inspected in this audit. |
| Help, demonstrations and messages | `app.js` Help text directs users to Club Batting; public pages link to `demo.html`, whose full rebuild is explicitly parked in AGENTS. The same demo cannot yet substantiate final public product/role journeys. | Finish the public demo/Help alongside the final flows; audit invitation, trial, password and notification templates in their actual delivery settings as well as source. |
| Business/contact copy | `privacy.html` identifies David Smith/Club Batting and lists `enquiries@clubbatting.com`. Public footers link Privacy but no terms or general support page. | Reconcile the registered Mirelion umbrella with the existing operator/product wording and verify the support route; settle appropriate customer-facing terms before commercial launch. Do not invent a new mailbox or legal entity. |

Work that can begin before the second product name is settled: introduce shared brand/product display configuration while preserving stored product keys; prepare the Mirelion marketing shell and shared-account language; audit every domain-dependent integration; build representative standalone/combined acceptance journeys. Domain switching, permanent product naming, external account renaming and commercial launch remain separate decisions requiring concrete configuration and verification.
