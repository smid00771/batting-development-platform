CLUB BATTING 0.8.62.125 — PHONE VIDEO PREVIEWS

Upload everything INSIDE Website_Files to your existing GitHub Pages root,
including videos. Replace matching files. Keep config.js, styles.css and CNAME.
Refresh/reopen the app and check version 0.8.62.125.

On Account > App & notifications, the iPhone or iPad and Android sections each
contain their own preview image and Watch video button above the written steps.
The old pair of video links above the device sections is removed. On a phone,
the matching device video also has a preview image. Tap the image or Watch video
to open the existing captioned player. Full videos load only when selected.

The videos themselves are unchanged: the real 43-second iPhone walkthrough and
the existing illustrated Android guide. David approved the iPhone edit.

This ZIP includes .124 and the earlier 60-day Batting / 21-day Teams trial update.
You do not need to upload .124 separately. No database or Stripe changes are
required. Leave payment mode on Prototype; do not rerun old SQL migrations.

Checked: correct video inside each device section; matching posters and playback;
phone layouts at 320/390 pixels and desktop at 1280 pixels; no app exceptions.
All 33 video assets are byte-for-byte unchanged. Notification and trial logic
is preserved. The website awaits your manual upload.

Maintenance: run tools/build_phone_video_sections.py after earlier builders.
It preserves the later notification patches and rebuilds the demo. Package with
tools/package_phone_video_sections.py. Screenshots and the verification record
are in tests/phone_video_sections_v125.
