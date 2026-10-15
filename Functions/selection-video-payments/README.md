# Selection Room video credits

Active Selection clubs receive six hours of video for four people each year (86,400 participant-seconds). Usage is measured in connected participant-seconds. Purchased credit carries forward; included credit renews on the club's anniversary. Newcastle City's existing complimentary pilot policy remains separate.

Club Admin can buy a one-off pack from Selection Settings or Selection Room:

| Pack | Price | Participant-seconds |
| --- | --- | --- |
| 5 hours for four people | A$15 | 72,000 |
| 24 hours for four people | A$60 | 345,600 |

The balance shows held time and warns when one four-person hour remains. Chat and the selection board remain available when video credit runs out.

## Payment confirmation

The authenticated credit API creates an immutable order containing the club, requesting admin, pack, price and Payment Link. Stripe receives only the opaque order UUID in `client_reference_id`. The webhook verifies the raw-body signature with Stripe SDK 23 and checks the account mode, paid status, link, order, currency, amount and session creation time. Returning from checkout never grants credit.

Session and payment-intent uniqueness prevent duplicate credit, including retries with different event IDs. Delayed payment success is supported. Full and partial refunds remove proportional credit; refunds arriving before checkout confirmation are retained. Unmatched paid events are recorded for review.

The webhook secret is stored in Supabase Vault. Only the service role can access its dedicated RPC or fulfill payments. No Stripe API key is needed by the function or browser. The webhook disables gateway JWT verification because it authenticates Stripe's signature itself. The usage worker authenticates one-use server capabilities. The video function validates the user's JWT and club access.

## Deployment

Apply the `selection_video_credit_packs` migration, then run the rollback-only database tests. The migration initially disables managed video and checkout. Deploy `selection-video`, `selection-video-usage` and `selection-video-payments` from their matching folders.

Create fixed-price AUD Payment Links for the two packs, with quantity one, no adjustable quantity and no promotion codes. Subscribe the account webhook to `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded` at `/functions/v1/selection-video-payments`. Save its signing secret in Vault, associate the secret UUID with `video_credit_config`, and populate each pack's price ID, Payment Link ID and URL. Enable the packs and configuration flags only after the backend checks pass.

The usage scheduler checks every minute and leases up to ten calls per worker. Reservations settle only after two complete, matching Daily usage observations at least three minutes apart. Incomplete or unavailable provider records keep the reservation for review.

## Verification

Install `jsdom@26.1.0` and `stripe@23.0.0` in a temporary directory, then set `NODE_PATH` to that directory's `node_modules` when running:

```sh
node --test Tests/selection_video_test.mjs Tests/selection_video_usage_test.mjs Tests/selection_video_payments_test.mjs Tests/selection_video_stripe_signature_test.mjs Tests/video_credits_ui_test.mjs Tests/selection_room_ui_test.mjs
node --check app.js
node --check selection-room.js
node --check video-credits.js
```

Database regression files are `Tests/selection_video_credits_database_test.sql`, `Tests/selection_room_database_test.sql` and `Tests/selection_video_usage_database_test.sql`. They use synthetic fixtures and roll back their changes. Never use a real purchase to test fulfillment.

To suspend new commercial joins or purchases, disable the corresponding `video_credit_config` flags. Existing purchased balances and the complimentary pilot remain intact.
