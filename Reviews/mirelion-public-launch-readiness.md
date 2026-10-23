# Mirelion public launch requirements

Structure recorded 21 October 2026; Mirelion Select product name confirmed 22 October 2026. These requirements govern the wider public launch after Newcastle City's beta. A beta deployment does not establish public-launch readiness.

## Settled structure

- Mirelion is the umbrella business and leading website brand.
- Club Batting retains its product name.
- Mirelion Select is the agreed name for the teams, availability and selections product, with its own product entrance.
- One Mirelion-led website presents both products with dedicated product pages and one shared sign-in.
- Clubs can use either product independently or both together, adopting them in either order. Shared club/player information is entered once.
- Existing Club Batting addresses and app access must have a deliberate migration/redirect plan before any domain change.
- Keep the established compact interface; branding must not add repeated headings, banners or page height.

## Release evidence required

| Area | Acceptance condition | Current evidence / outstanding work |
| --- | --- | --- |
| Product identity | Consistent Mirelion, Club Batting and Mirelion Select naming across website, app, installation, invitations, help and transactional messages. | Structure and both product names agreed. The .247 website and shared sign-in/trial entry use Mirelion, Club Batting and Mirelion Select. Installation, deeper in-app wording, help and externally delivered messages still need the full identity audit. |
| Website and domains | Two clear product journeys, shared sign-in, correct existing links and redirects; return URLs work on supported domains. | The Mirelion marketing repository now uses mirelionhq.com, purchased and ownership-verified by the user. Its demo-link deployment succeeded on 22 October; the existing clubbatting.com app and rebuilt demo remain live. Custom-domain HTTPS is still unavailable in the checked GitHub Pages settings and remains an open acceptance item. App origins, callbacks and authentication redirects were not migrated. |
| Standalone and combined clubs | A new club can start with either product, add the other later, retain its people/branding/history and see only its authorised products. | Must run and record the complete journeys using separate test clubs. |
| Roles and Selection Groups | Server-enforced no-access/view/edit boundaries; additive captain/coaching/social roles; safe invitation acceptance and Head Selector handover; no group left without publication authority. | .246 backend deployed and verified; 60 focused integration checks and five full-schema SQL suites passed before and after deployment in rollback transactions. Frontend release is tracked in PR #95. Live provider removal/rejoin verification remains outstanding; see `2026-10-21-selection-group-permissions-246.md` and the companion call-revocation review. |
| Club Batting participation | Only opted-in groups send new data to Club Batting; controls hidden without the product; opt-out preserves history and another participating team's batting work. | .245 server write guards are live and verified. The compact frontend controls are included in PR #95; visual acceptance remains outstanding. See `2026-10-21-automatic-results-245.md`. |
| Fixtures, results and identities | Automatic updates, late corrections and missing details preserve selections/history; shared scorecards remain consistent; identities never merge from names alone. | Existing beta evidence is partial. Check representative completed, incomplete, two-day and corrected games. |
| Trials and billing | Clear product/bundle prices, trial start rules, entitlement changes, cancellation and payment confirmation; correct business identity. | Final launch choices and end-to-end evidence required. Do not infer readiness from an existing payment link. |
| Social connections and posting | Correct business/app identity, role access, token/permission failure handling and explicit post review. | End-to-end multi-club evidence required. |
| AI graphic proposals | Visible proposed edits before Apply; reliable Undo; club-scoped saved designs; one weekly label across awards; each team list retains its own round. | .248 adds the shared proposal flow, numbered award weeks and fixture-specific team rounds. Synthetic canvas, permission, failure/retry and week-reset evidence is recorded in `2026-10-22-graphic-preview-248.md`. Real phone and second-club acceptance remain outstanding. |
| Phone and desktop use | Real user journeys have no dead ends, unnecessary scrolling, clipping or misleading saved states; sign-in and return navigation work. | Beta feedback ongoing. Automated DOM checks alone do not establish visual acceptance. |
| Support and operations | Consistent contact/help/privacy/terms text, recoverable failures, backup/restore evidence and visible operational ownership. | Inventory and verification outstanding. |

## Launch decision

The product names are settled. Public launch remains blocked until branding implementation, coherent website/product journeys and the verification evidence above are complete. Complete and link focused reviews as work finishes. Newcastle City's ongoing beta is the proving ground, not proof that every club configuration is ready.

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

## Baseline source audit — before the .247 website update

Source inspection only; this does not verify live service configuration, delivery or payments.

| Surface | Current implementation | Required launch work |
| --- | --- | --- |
| Public website | `index.html`, `batting.html`, `teams.html` already provide two product pages and a shared `app.html` sign-in, but headers, footers, metadata and the cricket icon brand the whole business as Club Batting. | Make Mirelion the shared website identity, with Club Batting and Mirelion Select as the two named products. |
| Trial and account entry | `enquire.html` forwards product choice into `renderProductTrialEntry` in `app.js`; it supports either product/both, existing clubs, email confirmation and chosen trial dates. Its surrounding identity still says Club Batting. `PRODUCT_ENQUIRY_LABELS` names the batting product “Batting development”. | Apply the umbrella/product distinction consistently; exercise new and existing account returns for each product and both adoption orders. |
| Installation and notifications | `app.html`, `manifest.webmanifest`, `offline.html` and `sw.js` label the shared app Club Batting. Manifest icons are cricket-specific. `sw.js` always uses the notification title Club Batting and reduces other notification bodies to a coaching update. | Agree the shared app identity and assets; verify a Teams-only club receives accurate product-neutral notification language and install/offline screens. Preserve installed-app identity and existing subscriptions during migration. |
| Domains and external return paths | `CNAME` and marketing canonical URLs use `clubbatting.com`. `Functions/playhq-sync/index.ts`, `Functions/playcricket-scorecard/index.ts` and `Functions/selection-video/handler.mjs` allow only Club Batting origins. Social publishing defaults to a Club Batting callback; calendar links accept only that origin. | Verify the selected Mirelion domain before changing it. Reconcile origin allowlists, Meta callback/configuration, authentication redirects, calendar and existing deep links as one migration. Do not replace strings blindly. |
| Subscription journey | `renderScheduledClubProducts` explicitly says online payments are disabled during the pilot. Video top-ups have a separate verified webhook in `Functions/selection-video-payments/handler.mjs`; that does not implement product subscriptions. | Settle product/bundle pricing and verify purchase, entitlement, expiry/cancellation and confirmation paths independently of top-ups. Check the customer-facing business identity in live payment configuration. |
| Social authorisation | `social-connect.html` and `social-connect.js` tell users to return/sign in to Club Batting. `Functions/club-social-publish/service.ts` has configurable Meta redirect/origin defaults. | Align the website, callback page and externally approved Meta identity without disrupting existing club connections. Live Meta settings were not inspected in this audit. |
| Help, demonstrations and messages | `app.js` Help text directs users to Club Batting; public pages link to `demo.html`, whose full rebuild is explicitly parked in AGENTS. The same demo cannot yet substantiate final public product/role journeys. | Finish the public demo/Help alongside the final flows; audit invitation, trial, password and notification templates in their actual delivery settings as well as source. |
| Business/contact copy | `privacy.html` identifies David Smith/Club Batting and lists `enquiries@clubbatting.com`. Public footers link Privacy but no terms or general support page. | Reconcile the registered Mirelion umbrella with the existing operator/product wording and verify the support route; settle appropriate customer-facing terms before commercial launch. Do not invent a new mailbox or legal entity. |

With Mirelion Select confirmed, the branding implementation can use the settled product names: introduce shared brand/product display configuration while preserving stored product keys; prepare the Mirelion marketing shell and shared-account language; audit every domain-dependent integration; build representative standalone/combined acceptance journeys. Domain switching, external account renaming and commercial launch remain separate decisions requiring concrete configuration and verification.

## Website implementation — .247

The Mirelion homepage and dedicated Mirelion Select / Club Batting pages are implemented with shared navigation, sign-in, privacy/contact links and compact phone layouts. Trial and enquiry labels use the agreed product names while preserving stored product keys. The root router now also preserves Selection Group invitation links. The .247 update removed links to the outdated demo. The 22 October rebuild below replaces it with current, separate product and role journeys.

See `2026-10-21-mirelion-website-247.md` for scope and validation. This is a beta website update, not the wider launch decision. A Mirelion parent domain can present both products without separate accounts or a second app. The user subsequently selected and verified mirelionhq.com. Custom-domain HTTPS and the complete migration/redirect acceptance remain outstanding.


## Demo reconstruction — 22 October 2026

The user resumed the full rebuild and explicitly requested three product choices and an ordinary player account. The new demo embeds app 0.8.62.250 and 41 current shared modules, with separate named fictional accounts for player, captain, selector, Head of Selections, Club Admin, coach, Philosophy Lead, workshop participant, Socials Manager and a realistic combined role.

`Reviews/2026-10-22-mirelion-demo-rebuild.md` records the focused automated and browser evidence. The downloadable HTML is generated from current source; `node Scripts/build-demo.mjs --check` detects drift. Product pages link to the corresponding demo role chooser and the homepage links to all three choices. The same artifact remains at `clubbatting.com/demo.html`; the Mirelion marketing host does not maintain a second demo copy.

The new-club example starts with no provider connection, groups or fixtures. Its real UI demonstrates request preparation, explicit sent confirmation, example credentials and season setup. This is a simulated journey, not evidence of a second real club obtaining API access. Similarly, demonstrated role boundaries and social/AI workflows do not replace server security tests or real Meta/provider verification. Help videos have not been rerecorded. The wider public-launch gates above remain open.

The 23 October bracketed-player demo correction removes a legacy layout insertion exposed in the Head of Selections view. The generated artifact passes all 32 focused tests plus paired-player DOM checks in Select-only and combined Head/Selector journeys. Fresh desktop/phone visual acceptance remains unverified because browser controls timed out; see the correction evidence in `2026-10-22-mirelion-demo-rebuild.md`.


## 23 October 2026 — Mirelion Assist

Private in-platform support messaging is prepared in app 0.8.62.254. The backend migration and synthetic rollback verification are complete; release and HTTPS visual acceptance are tracked in [the Assist review](2026-10-23-mirelion-assist-254.md). This does not change prices, trial lengths, public-domain readiness or the scope of public-launch approval.
