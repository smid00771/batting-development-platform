# Individual dismissal viewing — 0.8.62.325

Match Review places each batter's dismissal directly below their Runs, Balls, SR, 4s and 6s. A verified match thumbnail supplies the play card where available; clicking opens that batter's exact PlayCricket highlight in a separate tab. The image is the match preview, not a claimed still of the dismissal. A failed or unavailable image leaves a working Watch dismissal control. DNB and not-out records cannot show a dismissal, including deliberate saved corrections.

The 31 October Newcastle City–Hamilton-Wickham first-grade match now has explicitly verified PlayCricket dismissal links attached to its existing PlayHQ scorecard: eight City dismissals and six opposition dismissals. The complete match, both teams, innings, all 22 batters, order and figures were checked before attaching the provider's highlight IDs. No source player IDs, batting/bowling figures, orders, coaching contributions or timestamps were changed. The live Match Observation score readback returns all eight City clips and thumbnail references for the eleven saved player scores.

The private retention helper preserves verified links through unchanged PlayHQ score refreshes. A changed source, innings identity or batting record drops the old link for fresh verification. Matching this one game does not establish automatic discovery across providers for future PlayHQ fixtures. Native PlayCricket imports already read their own provider-supplied highlight IDs.

This is the viewing and human-review step agreed with the user. Captains, coaches and players use their existing shared observations and provider playback access. No underlying FrogBox stream is embedded, downloaded or sent for analysis, and no paid analysis or new account was created. PlayCricket's frame policy prevents embedding its site. Permitted video retrieval and AI analysis remain separate future work, covering dismissals and boundary highlights against the Player Plan.

Validation:

- Targeted link, identity/import, replay and shared-contribution checks passed. Tests reject wrong games, partial/duplicate mappings, reordered batters, differing figures, unsafe URLs and unrelated thumbnails; verify refresh retention/corrections and exact score-column placement.
- Live rollback-only shared-contribution tests passed with authenticated captain, coach, player and outsider roles. The automatic-results source regression also passed.
- The guarded metadata update affected only the expected latest saved snapshot. Readback confirmed 14 clips, 14 thumbnail references, eight City clips, zero clips for DNB/not-out players and unchanged non-media scorecard data.
- Security and performance advisors introduced no new findings (457 and 294 existing findings respectively). The helper has no public, anon or authenticated execution grant.
- Full laptop, 960px and 375px-content phone layouts were inspected; the phone has no horizontal overflow. This environment could not retrieve the official YouTube match thumbnail; the real image-rendering path remains unverified here. Its failed-image fallback was verified in-browser and preserves the exact dismissal action. No fictional image was substituted.
- Generated-demo freshness, JavaScript syntax and whitespace checks passed. Private match mappings, snapshots and preview overrides remain outside the published source.
