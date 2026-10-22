# Mirelion parent website

Prepared 22 October 2026 for `mirelionhq.com`, registered by the owner through VentraIP. This is the beta website domain setup, not the wider commercial launch or a move of the installed app.

## Two website hosts, one app

| Address | Purpose |
| --- | --- |
| `https://mirelionhq.com/` | Mirelion parent homepage |
| `https://mirelionhq.com/teams.html` | Mirelion Select product page |
| `https://mirelionhq.com/batting.html` | Club Batting product page |
| `https://mirelionhq.com/contact.html` | Existing support mailbox and app entry |
| `https://mirelionhq.com/privacy.html` | Existing privacy and deletion information |
| `https://clubbatting.com/app.html` | Shared app, sign-in and product trial chooser |

All normal sign-in and trial links go directly to the existing app. The parent site contains no account SDK, client configuration, service worker or club data. Its root invitation/authentication links and `app.html`/`enquire.html` compatibility pages forward to the existing host, preserving the original query and fragment. That preserves the existing app origin, accounts, installed-app identity, notifications, payment returns and approved social callbacks. It does not establish that arbitrary new-origin OAuth redirects have been approved.

The current repository's root `CNAME` remains `clubbatting.com`. GitHub Pages has one primary custom-domain setting per site; do not replace it with the new parent domain. Use a separate public repository named `mirelion-website` under the same GitHub owner to host the parent site's generated files.

## Build the exact publish bundle

The checked release is [mirelionhq-beta-2026-10-22.zip](releases/mirelionhq-beta-2026-10-22.zip) (15 files, 25,987 bytes). Its SHA-256 is `d365d5cc9e4e35df585c384476649d5fd2a2b9ee53c4da4fba051a2d5667410e`. The same 15 files are saved in `Website/publish` for review. Rebuild and replace both that snapshot and the archive if any source website file changes before activation; edit the source marketing pages, not the snapshot.

From the source checkout, using Node 20 or later:

```sh
node Scripts/build-mirelion-site.mjs
```

This writes the 15 allowlisted static files into `Website/dist`. The source marketing pages remain the single source of truth. The builder adjusts only the new site's canonical/share URLs, app handoffs, beta indexing metadata and Contact link, and adds the support/error/handoff pages. The generated `CNAME` is `mirelionhq.com`.

`release-manifest.json` contains SHA-256 checksums for the publish files. Builds from unchanged input are deterministic. Generated output is ignored by Git. The build refuses a source directory or a publish directory containing unexpected files. Never upload the entire app checkout as the new parent site.

For a ZIP, put the **contents** of `Website/dist` at the archive root, including `.nojekyll` and `CNAME`. There must not be a containing `dist` folder after extraction into the website repository.

## Hosting setup

1. Finish GitHub account-level domain verification. Keep the verification TXT record in VentraIP afterwards. The verification value comes from the owner's GitHub Pages settings; it is not an application key and is not stored in this source tree.
2. Create the separate `smid00771/mirelion-website` public repository and copy only the generated bundle into its `main` branch.
3. In that repository's **Settings → Pages**, publish from **main / (root)**. Confirm the **Custom domain** is `mirelionhq.com` before pointing the new domain at Pages. This is the new repository, not `batting-development-platform`.
4. Add the website DNS records below in VentraIP. Keep the verification TXT record. Record existing new-domain web records before replacing a parking A/AAAA/CNAME record. Do not alter MX, TXT mail verification or the separate Club Batting domain.
5. Wait for GitHub's DNS check and certificate to complete, then enable **Enforce HTTPS**.
6. Run the live checks below. The initial public website still identifies the beta and carries `noindex` on every HTML page. Search indexing and wider commercial launch need their separate release decision.

## Website DNS records, after hosting is configured

These are the published GitHub Pages records for an apex domain. VentraIP's empty Hostname field represents the root domain.

| Type | VentraIP Hostname | Value |
| --- | --- | --- |
| A | Leave blank | `185.199.108.153` |
| A | Leave blank | `185.199.109.153` |
| A | Leave blank | `185.199.110.153` |
| A | Leave blank | `185.199.111.153` |
| CNAME | `www` | `smid00771.github.io` |
| TXT | `_github-pages-challenge-smid00771` | Retain the value copied from GitHub's verification screen |

Keep the default TTL. GitHub handles the `www` to apex redirect once both names are configured. Configure the custom domain on the new Pages site before changing A/CNAME records; verification alone does not attach a website. DNS and HTTPS issuance may take up to 24 hours.

Sources: [GitHub custom-domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [GitHub domain verification](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages), [VentraIP DNS editor](https://ventraip.com.au/support-centre/add-remove-or-manage-dns-records-within-vipcontrol/).

## Live acceptance

- Apex and `www` serve the intended site with a valid certificate; HTTP upgrades to HTTPS and `www` resolves to the chosen apex.
- Homepage, both product pages, Contact, Privacy and a deliberately missing nested page load without broken assets or horizontal overflow.
- Shared sign-in reaches `https://clubbatting.com/app.html`. The two product buttons preselect `selections` or `batting`; Try both preselects `both`. Check the unsigned chooser without submitting a new account or trial.
- A synthetic root invitation and direct app handoff preserve the raw query and fragment, then reach the original host. Use fake tokens; never log live credentials. These route checks are not proof of account creation or email delivery.
- Existing Club Batting homepage, app, invitations and installed app continue on the original host. Do not clear users' data or change authentication, Meta, payment, calendar, push or backend origin settings for this website-only step.
- Compare deployed static-file checksums with `release-manifest.json`.

## Rollback and future work

If the new website fails acceptance, restore its captured web DNS settings and repair or unpublish only the new website. Retain the GitHub ownership TXT record. If disabling the new Pages site, remove its pointing web DNS records first. The old app and its hosting remain independent.

Migrating the app to a Mirelion URL later is a separate, tested change covering sessions, sign-in returns, invitations, PWA installation and push, origin allowlists, calendar links, payment returns and Meta approval/callbacks. Keep `Reviews/mirelion-public-launch-readiness.md` as the wider-launch gate. Demo rebuilding and help-video updates remain parked until their user flows settle.
