# Stats setup discoverability — .367

Replace the easy-to-miss small summary text/triangle with an outlined, lightly tinted Stats setup control, settings icon and rotating expand/collapse chevron. Season dates sit alongside it and wrap only when needed. Keep the native details/summary keyboard behaviour and focus ring, compact folded layout, existing fields, drafts, saves and permissions.

No database or statistics changes. The existing Season stats UI and shared demo suites pass all 40 tests. Demo rebuilt from the same 82 modules; freshness and whitespace checks passed. The live entry point and panel cache version advance to .367; unchanged dependencies retain .366.

Deployment `d3d5932d011667a29a904267ec5028ec77e8f20e` passed GitHub Pages run `43587278321`. All five changed public app/demo assets byte-match the tested files. The deployed demo was visually verified at 1200 px and 390 px: the control and season dates fit on one line at both widths. Enter opens setup; Space closes it. The settings icon, stronger label and chevron are visible while collapsed.

[Control preview](stats-367/control.jpg) · [Phone verification](stats-367/phone.jpg)
