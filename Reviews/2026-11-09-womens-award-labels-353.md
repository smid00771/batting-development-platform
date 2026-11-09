# Women's award labels — 0.8.62.353

Newcastle City's Women's 1st Grade and Women's 2nd Grade display as W 1ST and W 2ND on Team of the Week, Player of the Week, Results, Century and Five wickets graphics.

Added the two aliases to all five existing saved layouts in one revision-checked transaction. Readback verified both labels and confirmed every unrelated saved label was retained, including edits made since .352. No source team names, match figures or previously generated images were modified.

The shared label renderer recognises straight/curly apostrophes, omitted apostrophes and club prefixes, keeping Women's 1st and Women's 2nd in separate matching groups. Exact club aliases still take precedence. Men's and unqualified grades keep their existing labels. Updated module versions and rebuilt the shared demo.

Validation covers both grades, spelling variants, grade isolation, existing abbreviations, actual award canvas rendering, graphic-assistant save/reload and award refinement. Results fixtures use separate image batches within the existing layout limits. Changed JavaScript syntax and generated-demo freshness were checked.

Inspected the actual Team of the Week and Results canvas proofs with both women's labels and verified the rebuilt demo at desktop and 390 px phone width.
