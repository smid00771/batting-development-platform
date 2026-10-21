# Mirelion website — .247 beta

21 October 2026 UTC. Implements the agreed umbrella and product identities while Newcastle City remains the beta tester. This update does not establish public-launch readiness.

## Changed

- Mirelion homepage with “Club life, made easier”, direct product entrances and explicitly illustrative product examples using fictional players.
- Dedicated Mirelion Select and Club Batting pages, shared sign-in, small phone menu, contact and privacy navigation.
- Shared account entry and trial/enquiry chooser use Mirelion and the agreed product display names. Stored `batting`, `selections` and `both` keys are unchanged.
- Marketing favicon and wordmark use a simple Mirelion monogram. Installed-app manifest, icon identity and subscriptions are unchanged pending a deliberate migration.
- Privacy changes are limited to site/product identity, navigation and update date; operator, contact route and information-handling provisions are preserved.
- Existing `teams.html`, `batting.html`, `enquire.html` and `app.html` paths remain. The root router now recognises `selection_invite`, preserving raw query and fragment strings.
- Outdated demo is no longer promoted on the marketing pages. Its rebuild remains parked.

## Validation

- 22 checks passed across marketing routes, signup entry and people signup recovery. Checks cover opaque invitation/auth strings, standalone/combined trial handoffs, local asset/navigation targets and existing account-return/failure paths.
- `node --check app.js`, `node --check marketing.js` and `git diff --check` passed.
- Browser inspection of desktop homepage and Club Batting page; product example switching; mobile menu to Mirelion Select; phone-width and tablet-width frames with no horizontal overflow. Phone illustrations were shortened and both product links placed directly below the opening copy.
- Browser followed Club Batting and Mirelion Select CTAs into the real unsigned trial renderer with the correct product preselected; combined choice showed 60 and 21 days respectively. No account was created, no email was sent and no trial was submitted. This is not end-to-end entitlement or email delivery evidence.
- Responsive browser frames are not physical-device acceptance. Newcastle City’s installed-app/device journeys remain a wider-launch gate.

## Domain and release boundary

The site remains on `clubbatting.com`. No new parent domain has been selected, registered or verified, and no DNS, CNAME, backend origin allowlists, auth redirect URLs, social callbacks or calendar origins were changed.

The intended final structure is one Mirelion parent website, both product pages and one shared app/sign-in. Before switching domain, verify ownership; arrange HTTPS and an explicit old-host redirect plan that preserves paths, queries and fragments; update and exercise authentication, invitations, calendar subscriptions, social callbacks, installed-app behaviour and backend origins. Retain the existing domain for old links. Do not assume a GitHub Pages CNAME change alone redirects a separately registered old domain.

Remaining branding work includes installation/offline/push identity, deeper app navigation/help, external templates and billing/social identities. The full standalone/combined adoption journeys and other gates in `mirelion-public-launch-readiness.md` still apply.

## Deployment

Prepared for the existing GitHub Pages beta site; deployment evidence is recorded in the pull request and Pages workflow. No new hosting project or domain is provisioned by this change.
