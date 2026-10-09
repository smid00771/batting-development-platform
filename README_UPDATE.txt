CLUB BATTING 0.8.62.124 — REAL IPHONE WALKTHROUGH

Upload everything INSIDE Website_Files to the existing GitHub Pages root,
including the videos folder. Replace matching files. Keep your existing
config.js, styles.css and CNAME. Then refresh/reopen the app and check .124.

The iPhone: app and alerts tutorial now uses David's two actual iPhone screen
recordings. It shows Safari > Share > View More > Add to Home Screen, opening
the app, enabling notifications, tapping Allow and the Notifications on result.
The 43-second video has captions, close-ups and highlights for the key controls.
The password/autofill interaction is omitted; personal sharing contacts are
cropped out. The original recordings are unchanged. There is no narration.

The new video is in App & notifications and Help & Tutorials. A separate MP4 is
included for previewing or sharing. The existing Android video remains an
illustrated guide; no real Android recording has been supplied.

This is a cumulative website update: it also includes .123's separate 60-day
Batting and 21-day Teams trials, and all 11 Help videos. There is no need to
upload .123 separately. The website has NOT been published by the assistant.

No SQL or Stripe changes are required. The .123 backend trial settings and
Guide v39 are already deployed. Payment mode remains Prototype, prices remain
unsettled, and Newcastle City's current editable free arrangement is preserved.
Do not apply old source migrations. The separately prepared .122 notification
migration is still outstanding; this video update does not deploy it.

Verification: full MP4 decode; actual video playback and seeking in the app at
320, 390 and 1280 pixels; written steps, load-error fallback and no overflow.
These are desktop Chromium checks using phone-sized viewports, not testing on
a physical iPhone. The raw recordings show the actual iPhone permission flow.
Receipt of a test push notification is not shown or claimed.

Maintenance: tools/videos/iphone_recording.py renders from the two originals.
Run tools/build_iphone_walkthrough.py after earlier builders. It preserves .123
and rebuilds the demo. The source backup contains source identifiers and hashes,
but not the personal original recordings. Current video QA is in
tests/iphone_video_v124; earlier simulated iPhone QA is archived under
video-authoring/archive-v122/phone-iphone.
