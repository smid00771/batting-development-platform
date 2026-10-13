# Selection Room video

The Selection Room button is in Teams & availability. Chat is stored privately in the club database. Assigned selectors can join; the Head of Selections can set a Teams, Meet or Zoom backup link.

## Daily connection

1. Open the Daily dashboard and choose Developers: https://dashboard.daily.co/developers
2. Add the Daily API key as the `DAILY_API_KEY` Edge Function secret in the existing Supabase project. Never add it to browser configuration, source control or a chat message.
3. Open Selection Room and choose **Check video connection**, then **Join video**.
4. Verify with two selector accounts: camera/microphone, audio, leaving, and team changes while the call stays connected. Confirm a player account cannot access the room.

The function also uses the automatically supplied `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It validates the caller with Supabase Auth and the selector RPC, with JWT verification enabled at the gateway. It does not use a service-role key.

## Pilot limits

Video is disabled unless the club has an enabled `club_selection_private.selection_video_policy` row. The Newcastle City pilot reserves up to 5,000 participant minutes per UTC month. All enabled clubs together reserve at most 9,000. Each join reserves the remaining call duration, rounded up with a one-minute margin. Failed joins retain that reservation; retries reuse their request ID. Leaving early does not release it.

Calls expire after 90 minutes, or at the UTC month boundary, with up to 12 participants. A private, expiring Daily token binds each user entry to one room. Duplicate token identities cannot join simultaneously. Recording, transcription, dial-out and paid caption controls are not enabled by this integration.

These are application limits, not an account-wide Daily billing cap: unrelated Daily usage is outside this allowance. When the allowance is reached, chat and the backup meeting remain available.

## Tests

Run `Tests/selection_room_ui_test.mjs` with jsdom available and `Tests/selection_video_test.mjs` with Node. Run `Tests/selection_room_database_test.sql` against the migrated database; it uses synthetic clubs and rolls them back. Provider tests use mocks. A real two-person call requires the Daily key and remains a separate deployment check.

The demo page stores chat only in browser memory and never calls Daily.
