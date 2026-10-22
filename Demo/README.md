# Mirelion interactive demo

`demo.html` is a generated, self-contained copy of the current application UI, using fictional in-memory data. It never connects to a real club. The canonical hosted artifact is `https://clubbatting.com/demo.html`; Mirelion's marketing site links here rather than maintaining a second copy.

## Build and verify

```sh
npm ci
npm run build:demo
npm run check:demo
npm run test:demo
```

The builder needs only Node's built-in modules. Tests use the locked jsdom development dependency and run the actual delivered HTML. Rebuild after changing the app, any imported UI module, styling or a Demo source file. `build-manifest.json` records the app version and SHA-256 of every input. A freshness check fails if the artifact differs from its sources. Browser visual checks remain necessary; jsdom stubs canvas drawing and cannot verify appearance.

## Journeys

Start with Mirelion Select, Club Batting or both, then choose a role. Each role is a distinct fictional account. Product and role switches retain changes made in that tab; Reset demo or reload restores the examples.

| Role | Example access |
| --- | --- |
| Just a player | Own availability and published teams in Select; own plan, practice, preparation and reflections in Batting. No selection drafts or staff tools. |
| Captain | Own team's workspace and captain responsibilities; no selector or administrator grant. |
| Selector | Edit Senior cricket; view Masters; cannot publish either group. |
| Head of Selections | Lead/publish Senior cricket; view Masters, which has an independent Head Selector. |
| Club Admin | People, product and selection setup; no automatic selector grant. |
| Coach | Coaching, plans and feedback in Club Batting. |
| Philosophy Lead | Lead the workshop and club batting philosophy. |
| Workshop participant | Contribute without losing their normal player access. |
| Socials Manager | Create graphics and manage the example post collection. |
| Combined role | Player, captain, workshop participant and socials permissions together; no administrator or selector privilege. |

Query links support `product=select|batting|both` and optional `role`, `journey`, `scenario=newclub`. Existing `stage` links are translated to an appropriate product and account. The welcome screen's **Try a new club's setup** opens an empty Select club at Connect PlayCricket.

## Data and isolation

- `fixtures.js` preserves fictional batting, coaching, workshop and selection examples and their memory adapters.
- `current-fixtures.js` supplies current Selection Groups, permissions, awards, fixture and connection contracts. Upcoming fixtures roll forward; completed fictional scorecards support awards and stats. The Masters abandoned first round has no actual figures and does not request scores.
- `journeys.js` provides the role chooser, router and clearly identified simulation helpers. All five awards have independent group/grade scopes and a shared numbered Week label.
- `isolation.js` replaces live SDK access, browser storage and external requests. CSP blocks network connections and embedded provider frames. No production configuration or keys are included.

Provider requests, key checks, polling, messages, calls, invitations, AI and Meta posting are simulations. Only `DEMO-KEY-NOT-REAL` is accepted by the example connection. The graphic assistant supports a few labelled example requests and uses the actual proposal/Apply/Undo UI; it consumes no AI allowance. External service failures, billing and server security still require their own live acceptance evidence.

`Scripts/sync-demo-socials.mjs` remains a compatibility entry point for the full builder. Do not hand-edit generated `demo.html` or rebuild only one old demo subsystem.
