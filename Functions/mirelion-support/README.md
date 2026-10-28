# Mirelion support worker

The existing Assist conversation is the front door. New messages queue bounded server work; no AI code, polling or requests are added to ordinary startup or the Selection Board. Existing conversations remain human-managed. New conversations can opt into automation through the server rollout setting.

The model routes routine questions to versioned, reviewed product instructions in `knowledge.mjs`. It cannot author arbitrary outgoing text, change records, retrieve club data, follow message links or choose recipients. A request for a person, an unresolved fault, account/billing issue, requested change, unknown question, third unsuccessful exchange or unavailable model goes to a person. The existing inbox sorts these conversations first, and its normal email alerts link to the same thread. A human reply cancels pending bot work. `Ask a person` does the same explicitly.

## Configuration

Use existing Supabase `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OUTBOX_WEBHOOK_TOKEN`, `OPENAI_API_KEY` and `OPENAI_GUIDE_MODEL`. `OPENAI_SUPPORT_MODEL` optionally selects a separate configured model. Do not put values in source or browser configuration.

The function verifies the private scheduler credential itself. Deploy with gateway JWT verification disabled only because the same endpoint also verifies Resend's raw signed webhook. Ordinary user JWTs are rejected. All worker RPCs are service-role only; private tables have RLS and no anonymous/authenticated data privileges.

Apply `Database/mirelion_support_automation.sql` through its matching migration, then deploy this directory as `mirelion-support`. Both channels default off. The existing Assist API continues to work while off. Publish the updated Assist UI/privacy information before enabling new Assist conversations:

```sql
update mirelion_assist_private.automation_settings
set assist_enabled=true where singleton;
```

Pause with `assist_enabled=false`. The worker transfers pending jobs to people; it never replays historical messages when enabled. Defaults are at most 200 model attempts per UTC day globally, 20 per requester/sender and three automated replies per conversation. A cron check runs each minute and calls the worker only while there is work. Leased jobs abandoned for four minutes return to human support.

## Connect the existing support mailbox

The existing public privacy page names VentraIP/Axigen. Keep `support@mirelionhq.com` and its mailbox/MX records. The prepared adapter uses Resend receiving, alongside the already-used Resend outbound service. The receiving route is **not established by deploying this code**.

1. Verify the actual mailbox destination. Create a dedicated Resend receiving address or subdomain, then forward a copy of support mail from the existing mailbox to it. Preserve the original inbox and do not redirect the whole domain's MX records.
2. Subscribe a Resend webhook to `email.received`, targeting this function. Store its signing secret in `SUPPORT_INBOUND_WEBHOOK_SECRET` and the exact accepted receiving addresses in comma-separated `SUPPORT_INBOUND_ADDRESSES`. Do not accept arbitrary recipients.
3. Set `SUPPORT_FROM_ADDRESS` to an address the existing Resend account is verified to send from. Replies use `support@mirelionhq.com` as Reply-To. Use `RESEND_SUPPORT_API_KEY` if a separate key is needed; otherwise the existing `RESEND_API_KEY` must have receiving and sending access.
4. Verify the forwarding, webhook signature, provider retrieval, sender authentication, reply threading and delivery using a controlled test sender before setting `email_enabled=true`. Do not replay old email. Retain the original mailbox for HTML-only, oversized or attachment-bearing messages and any provider failures.

Email conversations appear in the same platform inbox, separately from signed-in club threads. An address match never grants account/club access or merges histories. Only a provider-computed DMARC pass permits a routine automated email response; uncertain senders and attachments go to people. Automated mail, bounce addresses and Mirelion's own notifications are ignored. Provider IDs and Message-IDs deduplicate receiving; replies use an immutable idempotency key, and uncertain delivery retries stop before Resend's 24-hour window expires. Delivery failures remain visible in the conversation.

## Verification

Run `Tests/mirelion_support_test.mjs`, the Assist UI/demo/entry/email tests, startup/navigation and selection-loading regressions. Run `Tests/mirelion_support_database_test.cjs` with the existing PGlite test dependency. It checks the original Assist permission assertions plus handover, staff takeover, stale jobs, rate limits, revoked access, email isolation, threading and delivery retries. Fixtures are fictional and provider calls are mocked. Service-authenticated `status` and `preview` actions can check configuration and synthetic answers without creating a message or sending email. Never use real support conversations for development tests.

References: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Resend receiving content](https://resend.com/docs/dashboard/receiving/get-email-content), [sender authentication](https://resend.com/docs/api-reference/emails/retrieve-received-email), [reply threading](https://resend.com/docs/dashboard/receiving/reply-to-emails), [Svix signatures](https://docs.svix.com/receiving/verifying-payloads/how-manual).
