# Club artwork preparation

Deploy `index.ts` as `club-social-prepare` with JWT verification enabled. It also verifies the signed-in user and their club artwork permission before checking the provider or starting a job.

The existing server secrets are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and optional `OPENAI_SOCIAL_IMAGE_MODEL`. The OpenAI key needs image-edit access and read access to the configured model metadata for the readiness check. No credentials belong in this repository.

`status` retrieves model metadata without generating an image or spending a club credit. A successful metadata check does not prove that a later image edit will succeed. Provider failures during editing are returned through the job with an actionable error. Logs contain only HTTP status, configured model and provider request ID, never the key, source image, prompt or raw error body.

A source from `/result/` is a revision: preserve the earlier edits and apply the new instruction. The existing worker records a club credit only after a completed image is stored. Every result still requires review and an explicit save.

Release validation uses mocked network responses; it does not generate billable images. After deployment, an authorized user can use Check again for a non-generating access check. Actual image editing remains unverified until a real preparation succeeds.
