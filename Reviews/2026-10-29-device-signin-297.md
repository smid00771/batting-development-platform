# Remember sign-in on each device — 0.8.62.297

The browser already used Supabase's persisted-session defaults. This release makes persistence, automatic token refresh and account-link handling explicit while preserving the existing storage key, so an app update does not discard a saved sign-in. There is no Remember me checkbox and no password is stored by the application. The current SDK version served by the previous `@2` CDN URL, 2.118.0, is pinned in both the app and the test dependency.

Ordinary Sign out previously used Supabase's default global scope, which also revoked the person's other devices. It now signs out only the current browser session, with the existing local notification and private-conversation cleanup. Account switching already used local scope and is preserved. Password recovery, genuine session revocation and server permissions remain authoritative.

Startup now checks session-restoration errors. A connection failure reaches the existing startup retry screen instead of being mistaken for a signed-out account. Valid saved sessions still enter their club directly, and the existing same-user focus/refresh handling preserves the current screen. Invalid password links retain the existing explanation and explicit recovery options.

Verification uses the real pinned Supabase JavaScript SDK against an isolated fictional auth transport and separate device stores. It covers closing/reopening the client without a password request, refreshing expired access tokens, preserving another device after local sign-out, respecting a revoked session, startup connection failures and password-link failures. No real credentials or accounts are used by these tests. Existing password, signup, domain, startup and delivered-demo regressions are included. Release and visual verification are recorded on the pull request.

Browser storage is specific to the browser/profile and website origin. Clearing it, using private browsing or a different browser, explicit sign-out and security-related session revocation can require sign-in again. This change does not lengthen access-token expiry, disable token rotation or change server session policies.

References: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [local sign-out](https://supabase.com/docs/guides/auth/signout), and [getSession](https://supabase.com/docs/reference/javascript/auth-getsession). The current changelog and session guidance were checked before implementation.
