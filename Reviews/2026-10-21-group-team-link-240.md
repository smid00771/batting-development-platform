# Link a team immediately after creating its group — 0.8.62.240

The pilot's City Summer Bash Selection Group was saved with no team. Its source link was not lost; the group summary simply lacked a clear next action.

Add or link a team now appears on empty group cards, after saving a new group, and for an empty group on the Season Captains page. The selected group carries into the importer and is already chosen when the team picker opens. Groups can still remain empty. Existing groups expose the same action under Manage existing teams.

Validation: all 26 focused import/group UI tests pass, including creating one group then selecting a source team in that group, and retaining a group choice across loading the saved season. JavaScript syntax and whitespace checks pass. No database change or club team-link mutation is part of this release. No physical browser/device visual verification was available.
