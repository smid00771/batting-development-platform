# Results example matching and winning margins — 0.8.62.290

The earlier wording fix did not establish adequate visual fidelity. A single global font could not reproduce a reference containing condensed headings, clean player names and brush outcome lettering. The Results renderer also omitted winning margins, and the PlayHQ summary adapter stored only the winner even when ordinary innings data supported a margin.

This change adds independent text roles, three optional licensed font faces, title/grade casing, glow outcome lettering, margin styling, panel/row geometry and safer shared-header logo fitting. Existing layouts keep their legacy positions until a template match is requested. Narrow wording edits preserve spacing. Both outcome words use the same role font and treatment.

Prepare background and Match our example now supply actual font specimens, render the suggested settings, and perform one bounded comparison with the saved club example. No new control is added. Ordinary follow-up edits remain single requests. Up to two existing style allowance units are used for a template match; there is no continuous computation. A failed comparison leaves the first valid proposal reviewable with an explicit warning. Apply/Undo never start AI, and save retries reuse the suggestion.

Margins are read from recorded result text. The PlayHQ adapter now appends ordinary margins derived from its declared winner and completed, ordered innings; uncertain, adjusted, penalty, long-form and unfinished cases remain unavailable. Current club records were refreshed through the existing leased scheduler, not patched with invented result text. All four reported matches returned margins. Source changes retain the existing freshness checks for confirmed images.

## Verification

- 153 relevant tests passed locally, covering role fonts, actual canvas output, paired wording, real margin parsing, importer corrections/exclusions, permissions, old-client compatibility, staged review, comparison-failure recovery, scopes, immutable images, preparation, demo navigation/roles, quiet Selection Board and lazy startup.
- Canvas proofs with fictional names were visually inspected for shared and different opponents. Text bounds and outcome/margin separation are checked in the renderer test. The supplied reference images and private player data are not included in the repository.
- Demo rebuilt from the source and freshness checked. Optional font bytes remain outside the live startup dependency graph.
- `club-social-style` version 11 deployed with JWT verification enabled; `playhq-sync` version 11 retains its existing scheduler-token/user-RPC authorization arrangement. Retrieved deployed source exactly matched the intended files. No database migration, connection-key change, club design overwrite or social posting occurred.

## Limits

The design tests use controlled model responses. They prove the renderer and review/save workflow, not the quality of a live model's choices for every uploaded reference. Actual model fidelity still needs club review. Fonts are close supported alternatives, not arbitrary font recognition or exact reproduction. The comparison precedes separately reviewed background generation, so it cannot certify the eventual artwork pixels. Unrepresented competition-specific wicket rules and absent adjustment metadata remain source limitations. Existing saved graphics remain immutable; a club previews and confirms a new graphic to use the new template.
