# Club social publishing

Deploy `index.ts` and `service.ts` together as `club-social-publish`. Preserve the existing `verify_jwt: false` setting: browser actions validate the signed-in user and club permission inside the handler, Meta callbacks verify a signed request, and the scheduled runner has its own secret check. No new secret or database migration is required.

## Business-owned Page discovery

The October 19 connection test returned an empty `/me/accounts` list despite five granted publishing/account permissions and full Page control. Adding `business_management` and consenting to the Page's owning business portfolio made the Page, its linked Instagram account, and `MANAGE` / `CREATE_CONTENT` tasks appear.

The app now requests `business_management` alongside `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, and `instagram_content_publish`. The owner setup screen lists the same six permissions. Keep this permission in the Meta app review request and include it in any Facebook Login for Business configuration used for the connection.

Page selection still requires a server-returned Page token and `MANAGE` or `CREATE_CONTENT`. The app does not use `can_post` to establish this authority. If no eligible Page is returned, the error directs the user to select the owning business and Page. A directly managed Page may still connect when business access is declined but Meta returns an eligible Page. Existing Page-token health checks do not require a business-management scope.

The only production service changes from deployed version 5 are the additional OAuth scope, the empty-Page error, and the source version comment. The remainder of the deployed source is now retained here for reproducible deployment.

## Meta review explanation for business_management

Club Batting lets an authorised club administrator or social media manager connect the club's Facebook Page and its linked professional Instagram account. Some clubs own their Page through a Meta business portfolio. We request business_management to discover those authorised Pages through /me/accounts during connection. The user selects the relevant business and Page in Meta, then chooses a returned Page in Club Batting. We require CREATE_CONTENT or MANAGE on the returned Page before accepting it. Page credentials are encrypted on the server and tied to that club. This permission is not used to change business ownership, people, advertising accounts or billing. Connecting does not publish anything; publishing uses the separate Page/Instagram permissions and requires an authorised user's reviewed post. The club can disconnect its accounts.

## Validation and remaining review steps

Run `node --test Tests/social_connection_service_test.mjs` and `node --test Tests/social_awards_publishing_test.mjs`. Tests use synthetic accounts and mocked Graph/Supabase responses. They check the OAuth request, discovery, task filtering, encrypted credentials, invalid selections and existing connection health.

The Graph API Explorer test confirms discovery only. An app OAuth round trip, approved test publication, reviewer account and recording, remaining data-handling declarations, and Meta access/app review approval still need completion. Use a separate test club for the test Page; do not connect it to the real beta club.
