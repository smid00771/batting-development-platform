# Selection Room video

The Selection Room button is in Teams & availability. Chat is stored privately in the club database. Assigned selectors can join; the Head of Selections can set a Teams, Meet or Zoom backup link.

## Daily connection

1. Open the Daily dashboard and choose Developers: https://dashboard.daily.co/developers
2. For the Newcastle City pilot only, add the Daily API key as the `DAILY_API_KEY` Edge Function secret in the existing Supabase project. Never add it to browser configuration, source control or a chat message.
3. Open Selection Room and choose **Check video connection**, then **Join video**.
4. Verify with two selector accounts: camera/microphone, audio, leaving, and team changes while the call stays connected. Confirm a player account cannot access the room.

The function also uses the automatically supplied `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It validates the caller with Supabase Auth and the selector RPC, with JWT verification enabled at the gateway. It does not use a service-role key.

## Billing boundary and rollout

The current `DAILY_API_KEY` is explicitly restricted to Newcastle City (`c6022ec7-00d9-4c91-a208-710272a0b866`) in the Edge Function. Other clubs are rejected before any minutes are reserved or any Daily request is made, even if their database video policy is enabled. Request parameters cannot select a billing account. Keep this restriction until platform billing is ready.

Preferred rollout: Club Batting manages Daily and bills clubs through Club Batting. Clubs should not need a Daily account, API key, or separate setup. This release does not enable that rollout or activate club charges. Before enabling it, arrange the business payment method, club subscription/allowance rules, reliable per-club usage reconciliation, and spending limits. Existing reservation totals are conservative admission limits, not actual billable usage.

## Using the board during a call

On a laptop, Selection Room opens beside the board. **Expand video** opens the larger call and chat layout; **Board + video** returns to the board. **Hide room** keeps the call connected. Layout changes and board refreshes preserve the existing video frame.

A selector can also sign in on both devices: join video on the phone and use the board on the laptop. The participant list only reports people in the Daily call; it does not imply that other selectors have been notified or are online elsewhere. Invitations are not sent automatically.

## Pilot limits

Video is disabled unless the club has an enabled `club_selection_private.selection_video_policy` row. The Newcastle City pilot reserves up to 5,000 participant minutes per UTC month. All enabled clubs together reserve at most 9,000. Each join reserves the remaining call duration, rounded up with a one-minute margin. Failed joins retain that reservation; retries reuse their request ID. Leaving early does not release it.

Calls expire after 90 minutes, or at the UTC month boundary, with up to 12 participants. A private, expiring Daily token binds each user entry to one room. Duplicate token identities cannot join simultaneously. Recording, transcription, dial-out and paid caption controls are not enabled by this integration.

These are application limits, not an account-wide Daily billing cap: unrelated Daily usage is outside this allowance. When the allowance is reached, chat and the backup meeting remain available.

## Tests

Run `Tests/selection_room_ui_test.mjs` with jsdom available and `Tests/selection_video_test.mjs` with Node. Run `Tests/selection_room_database_test.sql` against the migrated database; it uses synthetic clubs and rolls them back. Provider tests use mocks. A real two-person call requires the Daily key and remains a separate deployment check.

The demo page stores chat only in browser memory and never calls Daily.
