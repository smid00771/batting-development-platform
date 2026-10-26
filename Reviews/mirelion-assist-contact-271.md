# Mirelion Assist and contact routes — 0.8.62.271

The public contact page separates prospective clubs from signed-in support. Product and pricing questions go to enquiries@mirelionhq.com. Existing users open Mirelion Assist; support@mirelionhq.com is the fallback for access problems and direct email. Direct emails are not imported into Assist.

Assist keeps its private two-way conversation and unread badges. Unread club messages alert the support inbox; unread team replies alert the requester's current confirmed account email. Email contains a generic notification and a sign-in-protected link to the same thread, with Reply-To set to support@mirelionhq.com. It uses the existing verified notifications@clubbatting.com sender, displayed as Mirelion Assist. Replies within Assist preserve the conversation history.

## Behaviour and privacy

- The public support button opens Assist after sign-in, including when a platform administrator previously used the platform console. Staff notification links open Platform Admin Assist.
- Browser navigation records the selected thread. Existing draft, retry, identity isolation and read permissions remain in effect.
- Alerts wait two minutes, group rapid messages and enforce a ten-minute per-thread/per-side interval. Messages read before dispatch, resolved conversations and revoked membership are suppressed. Only new messages after enablement are scheduled; no old-message backlog is mailed.
- Private tables map notification IDs to conversations. Public outbox rows have no club ID, thread ID, subject text, body text or Guide conversation. Service-only validation rechecks the canonical recipient and thread before sending, so changing public outbox fields cannot redirect a private conversation alert.
- Retries reuse the existing authenticated dispatcher webhook server-side. No mailbox passwords or webhook credentials are added to the repository. The dispatcher keeps JWT verification and provider idempotency.

## Validation

- 93 focused and regression tests passed across Assist UI/demo, routing/sign-in, marketing, app navigation and demo role permissions; the additional dispatcher status test passed separately (94 total cases). The existing demo signup test fixture now supplies the demo's isolated storage, allowing its success path to execute.
- Local Postgres-compatible tests passed for delay, grouping, idempotency, private outbox data, canonical recipient selection, reads, resolved threads, revoked access, execution grants and webhook retry.
- Live database assertions ran inside a rolled-back transaction: insert trigger, queue, service-only validation, NULL-club/generic outbox, read suppression and retry. No message or HTTP request was committed. Queue remained empty and alerts remained disabled during rollout.
- Deployed dispatch-outbox version 37, retained JWT verification, and compared both deployed source files byte-for-byte. Provider/authentication/base-URL status is checked without sending a test email.
- Security advisor comparison introduced only the three expected informational notices for private RLS tables with no public policies; no new warning or error.
- Actual Chromium checks at 1440px and 390px: contact page and rebuilt demo Assist, message send/example reply, no script errors or horizontal overflow, 44px contact buttons and 16px phone fields. Demo freshness and syntax checks passed.

## Rollout and rollback

Deploy the migration and dispatcher before the app, then publish the app/demo and matching smid00771/mirelion-website contact/privacy pages. Enable mirelion_assist_private.notification_settings only after live static files are verified. The minute cron is mirelion-assist-email-alerts.

To pause alerts, set notification_settings.enabled=false. Sending and receiving inside Assist continues; the dispatcher cancels any notification it can no longer validate. The settings switch and private helpers are deliberately unavailable to anonymous and authenticated application users. No real-recipient test email was sent during verification; provider status and mocked provider delivery were tested.

This is an authorised beta support improvement, not a declaration of broader public-launch readiness.
