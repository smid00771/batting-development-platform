# Selection Room video

The Selection Room button is in Teams & availability. Chat is stored privately for the current call, with no previous-chat archive. Assigned selectors can join; the Head of Selections can set a Teams, Meet or Zoom backup link.

## Daily connection

1. Open the Daily dashboard and choose Developers: https://dashboard.daily.co/developers
2. For the Newcastle City pilot only, add the Daily API key as the `DAILY_API_KEY` Edge Function secret in the existing Supabase project. Never add it to browser configuration, source control or a chat message.
3. Open Selection Room and choose **Check video connection**, then **Join video**.
4. Verify with two selector accounts: camera/microphone, audio, leaving, and team changes while the call stays connected. Confirm a player account cannot access the room.

The function also uses the automatically supplied `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It validates the caller with Supabase Auth and the selector RPC, with JWT verification enabled at the gateway. It does not use a service-role key.

## Billing boundary and rollout

The current `DAILY_API_KEY` is explicitly restricted to Newcastle City (`c6022ec7-00d9-4c91-a208-710272a0b866`) in the Edge Function. Other clubs are rejected before any minutes are reserved or any Daily request is made, even if their database video policy is enabled. Request parameters cannot select a billing account. Keep this restriction until platform billing is ready.

Preferred rollout: Club Batting manages Daily and bills clubs through Club Batting. Clubs should not need a Daily account, API key, or separate setup. This release does not enable that rollout or activate club charges. Before enabling it, arrange the business payment method, club subscription/allowance rules, reliable per-club usage reconciliation, and spending limits. Existing reservation totals are conservative admission limits, not actual billable usage.

## Temporary selection chat

Each new server call starts a fresh chat. Comments from earlier calls are deleted, not archived. When the room expires, its comments are cleared by the next chat request or the minute-by-minute cleanup job. A selector leaving or reconnecting does not clear comments for people still using that room. Messages written between calls remain available until the next call starts; text chat still works when calls are unavailable. Requests from an expired chat cannot retry its old comments into the next call. Call expiry and verified usage settlement are unchanged.

## Using the board during a call

New calls default to audio-only. **Use video** appears only before the first selector starts a call; that choice fixes the room mode. Later joiners and retries inherit it. Audio-only room and token permissions allow microphone audio only, with no camera, screen or custom video and no participant permission to elevate access. Existing calls retain their prior video-capable mode. Starting video requires a separate room after the current one expires; leaving and rejoining does not change the mode.

Audio calls tuck the entire room away on connection so nothing overlays the board. **Call controls** in the normal navigation reopens the timer, microphone and **Leave call** controls; **Hide room** or the close icon tucks them away without ending the call. Video calls use a taller, scrollable view on phones. **Expand video**, **Board + video** and **Hide room** retain the same connected iframe. Browsing other Club Batting pages keeps the call connected; signing out, changing clubs/accounts or losing selector access closes it.

Switching to other phone apps remains subject to browser/OS restrictions. An iPhone home-screen web app can lose microphone capture in the background. The app never mutes automatically, offers an explicit **Resume microphone** control when interruption is detected, and suggests Safari for this specific case. Actual two-device camera/audio testing is still required.

The participant list reports people in the Daily call only; invitations are not sent automatically.

## Pilot limits

Video is disabled unless the club has an enabled `club_selection_private.selection_video_policy` row. The Newcastle City pilot allows up to 5,000 participant minutes per UTC month; all enabled clubs together have a 9,000-minute limit. Each join temporarily reserves the remaining call duration, rounded up with a one-minute margin. Retries reuse their request ID.

After the room and its tokens expire, the scheduled [usage worker](../selection-video-usage/README.md) replaces reservations with verified connected seconds from Daily. Failed joins then use zero and short calls return unused allowance. Four people connected for 20 minutes use 80 participant-minutes. Reconnect durations are added once. Active or unverified calls retain their reservation to protect the spending limit. The balance shows available and temporarily reserved credit separately, plus the latest verified call duration and participant credit once settled. The visible connection timer is not a billing authority. Audio and video use the existing club allowance; Daily provider rates are separate.

Calls expire after 90 minutes, or at the UTC month boundary, with up to 12 participants. A private, expiring Daily token binds each user entry to one room. Duplicate token identities cannot join simultaneously. Recording, transcription, dial-out and paid caption controls are not enabled by this integration.

These are application limits, not an account-wide Daily billing cap: unrelated Daily usage is outside this allowance. When the allowance is reached, chat and the backup meeting remain available.

## Tests

Run `Tests/selection_room_ui_test.mjs` with jsdom available and `Tests/selection_video_test.mjs` with Node. Run `node --test Tests/selection_video_usage_test.mjs` for usage accounting. Run `Tests/selection_room_database_test.sql` and `Tests/selection_video_usage_database_test.sql` against the migrated database; both use synthetic clubs and roll them back. Provider tests use mocks. A real two-person call requires the Daily key and remains a separate deployment check.

The demo page stores chat only in browser memory and never calls Daily.
