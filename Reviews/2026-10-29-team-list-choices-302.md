# Team-list posting choices · 0.8.62.302

The fixture-date route remains available. The existing selector is now labelled **Teams for this post** and also offers **Choose teams…** and **All published teams**. A Socials Manager can select any combination of published upcoming fixtures, including age-group and cup sides on another date, then prepare a separate post for another combination.

Individual choices show team, opponent, dates and start times. The photo editor uses **team** instead of **grade** and includes the chosen fixtures. The same IDs reach review, captions, downloads and the saved post. Browser Back/Forward restores the chosen IDs and mode. Opening graphics from publication or preparing a correction retains all affected fixtures across dates.

Published snapshots, fixture artwork validation, existing access checks, completed-fixture restrictions, two-day splits and the ten-image posting limit remain in force. This change needs no database migration and adds no startup requests. No live teams, photos or social posts were edited or sent during verification.

Validation covers the existing date route and separate date captions; a mixed-date grade/Under 21/cup draft; all-published selection; explicit empty selection; completed-fixture exclusion; exact photo and post membership; separate saved drafts; source selection order; navigation restoration; photo positioning; delayed optional loading; deletion recovery; and 20 MB input compression before upload. The shared public demo includes fictional Sunday cup and Under 21 teams. Rebuild with `node Scripts/build-demo.mjs` and check with `--check`.

The release workflow applies the reviewed patch, runs the focused and complete-demo checks, verifies its exact source tree and removes its temporary release files. Deployment status and live desktop/phone observations are recorded on the pull request.
