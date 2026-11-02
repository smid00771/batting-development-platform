# Mirelion 0.8.62.338

The playing list now offers **Edit name** beside each player. It opens a single name field with Save and Cancel, preserving the existing roster identity, linked account, roles, availability and history. The existing duplicate-name check and revision/request receipt protections apply. No real player's spelling was assumed or changed during implementation.

Season captain selection starts with a blank search box. Matches appear while typing; the current appointment stays visible. Selecting a match saves the same member or roster identity through the existing API. Keyboard selection, pending signups, removing an appointment and adding a new captain remain available. Typing alone does not change an appointment.

Grade levels show one current canonical team per Selection Group. Existing fixture labels such as NDCA and blank competition map to that one input. Saving updates those aliases together and retains historical settings. Conflicting old levels require an explicit choice. Women's and senior teams retain separate comparison scopes.

The women's Selection Group at Newcastle City now permits up to 13 named players as a normal team. Teams of 12 or 13 require no additional size acknowledgement. The allowance follows canonical team/group identity, not client-supplied labels. Availability, duplicate selection, overlapping games, revisions, publisher permissions and safe retry remain enforced. Other groups retain their existing XI/twelve-player rules. Copy previous team preserves up to 13 players for the configured group.

Database source: `Database/selection_group_player_limits.sql`. Applied as `selection_group_player_limits_338`, with the women's and existing twelve-player authenticated synthetic tests in the same transaction. Synthetic clubs, selections and messages were rolled back. Readback confirmed both City women's grades use 13; every other City group remains at 11. The new private helper is not executable directly by anonymous or authenticated clients. Security advisory counts are unchanged.

Validation: 89 focused JavaScript checks across captain selection, canonical grade settings, name edits/duplicate rejection/lost-response retry, team movement, copying and publication. Live authenticated SQL checks cover 12/13 without size acknowledgement, 14-player rejection, other groups, availability, duplicate selection, publisher permissions, all selected players and notifications, and idempotent retry. Rebuilt the standalone demo and checked its manifest, JavaScript syntax and whitespace. Inspected desktop and 390px phone layouts for grade levels, captain searches and the focused name editor.

One older unrelated follow-up UI harness was inspected and left unchanged: its mocks predate the current follow-up/role APIs. The focused current publication and full-demo checks above pass.
