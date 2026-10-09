CLUB BATTING 0.8.62.123 — SEPARATE TRIAL SETTINGS

Upload the CONTENTS of Website_Files to your existing GitHub Pages root.
Replace matching files. Keep your existing config.js, styles.css and CNAME.
This update includes .122 and its videos. David confirmed deploying .122 on
9 October; .123 is the subsequent trial-settings update.

After the upload, refresh/reopen the app and check version 0.8.62.123.
Platform Admin > Platform Settings > Product pricing & trials now has:
  Club Batting: 60 free-trial days
  Teams & availability: 21 free-trial days
Each product has its own field. Selecting Both keeps two separate trial lengths.
Signup date previews, product pages, Help, the Guide and demo use the new policy.
Saving prices keeps the trial settings. Existing agreed terms are preserved.

The backend change and Help/Guide update have already been deployed and verified.
DO NOT run SQL or reapply old migrations from the source backup.

Newcastle City's current free access for both products is unchanged and editable
by an authorised Platform Admin. David clarified that it is free while he owns
Club Batting; a later owner may choose different terms. No ownership-triggered
billing or automatic change has been introduced.

Leave PAYMENT MODE on PROTOTYPE. The Club Batting Stripe live account is enabled,
but app Checkout and verified payment fulfilment still need implementation and
testing before Live provider is appropriate. Connecting Stripe does not complete
the app integration. No prices or Stripe products were created by this update.

Current saved app prices were left unchanged. Pricing has not been finalised.
The previous notification migration, promotion rewrite, trial-end warnings and
complete read-only expiry work remain separate outstanding items.

Checks: 33 isolated database checks; pricing/settings and signup browser checks
at 320 and 1280 pixels; no real signup or messages. Live readback confirms all
existing trial, subscription and access records are unchanged, as are prices and
payment mode. The migration adds no new security-advisor findings.
