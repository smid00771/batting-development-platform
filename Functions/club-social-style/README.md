# Club graphic refinement

Deploy `Functions/club-social-style/index.ts` as `club-social-style` with JWT verification enabled. Include `award-refine.mjs` and the root `social-awards-design.js` dependency with their relative paths intact.

Existing team style requests are unchanged. `purpose: "award_refine"` adds natural-language edits to Results, Century and 5 Wickets previews. It validates the signed-in user and club permission, checks the saved design revision, then uses the existing `style_request` allowance and limits (five per hour, thirty per day). Every attempt gets a new server-generated request ID. No new database migration or secret is required; it uses the existing `OPENAI_SOCIAL_STYLE_MODEL` / `OPENAI_GUIDE_MODEL` and `OPENAI_API_KEY` configuration.

The model receives a bounded PNG of the current preview and this club’s saved previous example. It can return only the shared visual settings and tight WIN/DEF crop coordinates. No match facts, asset paths or executable content are accepted as changes. Crop images are fetched only from the saved, club-scoped example under the caller’s JWT. The UI separately labels both crops for review, and the renderer chooses the correct crop from the imported outcome. Draw, tie and no-result labels are always rendered from the imported result.

Suggestions are staged. Use this version saves the club’s style with optimistic revision checking; confirming the graphic then follows the existing source-signature checks and immutable image workflow. Undo restores the previous layout without another model call. Errors retain the current picture and brief. Artwork changes are forwarded, with their brief, to the existing image preparation/review flow inside the app. The style service never writes images, confirms results or publishes a post.

Validation: run the Results renderer, awards UI/recovery, preparation iteration, `social_awards_refine_service_test.mjs` and `social_awards_refinement_test.mjs` tests. These use mocked provider responses and do not spend club credits. Actual model suggestions and crop accuracy still require review on real club artwork.
