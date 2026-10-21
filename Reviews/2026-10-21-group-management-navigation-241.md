# Selection Group management, 0.8.62.241

Selection Groups previously redirected to the season importer whenever the club had saved source links. Managing an existing setup therefore looked like importing or repeating setup.

- Add a dedicated Selection Groups section within Teams & availability.
- Read the saved groups, mappings and cached source names without contacting PlayHQ or importing fixtures.
- Show indented teams with Move to group, Undo imported link and group renaming immediately. Add a team uses the saved source catalogue in the same page.
- Keep empty groups and the small manual fallback. Select Season Captains remains available; Continue to fixtures returns to the Selection Board.
- Preserve existing revision guards, retry receipts and reviewed source-disconnect protections. No club groups or links were changed for verification.

Validation: 32 relevant UI checks passed across the manager, page, initial import, group board and captain flows (one existing captain test was updated to expect the board destination). JavaScript syntax and whitespace checks passed. A synthetic rollback SQL check verified management without a provider connection, no new fixtures, and denial for an unrelated user. The new read-only management RPC is Club Admin restricted. No physical browser or phone rendering claim.

Per-group selector permissions remain separate work in progress and are not included in this release.
