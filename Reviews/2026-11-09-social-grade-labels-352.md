# Social award grade labels — 0.8.62.352

The Week 5 Team of the Week graphic displayed Dev Sky, Dev League Navy and Masters instead of the club's agreed labels. Saved Team of the Week aliases still contained older wording, other award layouts had no saved aliases, and the shared renderer required exact source-name matches. Some headings also uppercased explicitly saved labels.

Restored Newcastle City's agreed labels across Team of the Week, Player of the Week, Results, Century and Five wickets: DEV for both Dev sides, MSTRs for Masters, SGs for Moore Cup and DBs for Denis Broad. The five existing layouts were updated atomically using revision and full-layout checks, preserving every other layout field. Readback confirmed all five label lists and revisions. Team-selection settings, source grade names, statistics, selections and previously generated images were not changed.

The shared renderer now reuses a saved alias for recognised variants only when all aliases in that family agree. An exact saved alias takes precedence; different Navy/Sky aliases remain distinct. Saved label capitalisation survives uppercase headings. Other clubs without these aliases retain their existing wording. Updated module versions and rebuilt the shared demo.

Validation:

- Focused coverage of known source variants, exact aliases, conflicting aliases, untouched source facts and agreed capitalisation.
- Actual Results, Century and Five wickets canvas rendering; existing graphic-assistant save/reload and award-refinement integration checks.
- Generated demo freshness, changed JavaScript syntax and whitespace checks.
- All 13 focused/integration test entries passed, including demo navigation.
- Inspected native-rendered Team of the Week and Results proof images, plus the rebuilt demo at desktop and 390 px phone width in the browser.
