# Mirelion parent-domain preparation

22 October 2026 (Australia/Sydney). The owner has ordered/registered `mirelionhq.com` through VentraIP and is completing GitHub's ownership TXT verification. The user asked to prepare everything while DNS changes propagate.

## Prepared

- Reproducible static build of the agreed Mirelion homepage, Mirelion Select and Club Batting pages, plus Privacy, Contact and a useful 404 page.
- New-domain canonical and sharing URLs. Normal sign-in and trial buttons go directly to the existing shared app, with the correct stored product key. No second account or app is introduced.
- Root invitation/auth links and explicit app/enquiry compatibility pages preserve the raw query and fragment while handing off to a fixed existing origin. Input parameters cannot choose another host.
- Fifteen allowlisted publish files; no live app bundle, configuration, service worker, backend source or club data. A checksum manifest makes the eventual deployment reviewable.
- Page-level `noindex` during beta. Crawling is allowed so search engines can read that directive; this is not access control or a claim of private hosting.
- Exact new-repository, DNS, certificate, live-check and rollback instructions in `Website/README.md`. The root `CNAME`, current beta app and external service settings are untouched.

## Validation

- 15 automated checks passed across the existing marketing routes and the isolated parent-domain bundle. They cover product choices, raw invitation/auth handoffs, fixed destinations, fallback links, local assets/anchors, canonical URLs, beta indexing, support/privacy, output isolation, the unchanged original CNAME and reproducible checksums.
- Browser inspection of the parent-site pages and Contact page. Phone frames with 360/375px content widths had equal content and viewport widths, with no horizontal overflow. Product example switching and keyboard-opened mobile menu navigation worked.
- The Mirelion Select call to action reached the actual unsigned shared app with Mirelion Select selected and its 21-day trial displayed. No form was submitted, account created, email sent or trial started. Other product-key destinations are covered by automated checks.
- Script syntax and whitespace checks passed. The deployment ZIP contains exactly the 15 publish files and matches the release checksums.

The remaining live-domain checks require completed domain verification and a separate Pages repository; passing local checks is not a claim that the domain is live or that the wider product launch is ready. Browser phone frames are not physical-device acceptance. The app's deeper titles and installation identity still belong to the wider brand audit.

## Activation boundaries

The new marketing site needs its own Pages repository to retain the existing Club Batting host. The current GitHub connector can prepare source branches and PRs but does not expose repository creation or Pages administration. The browser creation page currently requires GitHub sign-in. All file preparation and review can be completed before that account step.

No DNS, GitHub Pages custom domain, backend, billing, authentication, Meta, notification or calendar settings are changed by this source preparation. The full app-origin migration and the wider launch gates remain separate.
