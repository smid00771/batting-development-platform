# Volunteer workflow review: overnight follow-up

16 October 2026 · Club Batting

## Resolution: release 0.8.62.189

All eleven findings below are addressed in release 189, together with the earlier release-188 fixes in PR #36. The original observations and release-status snapshot below are retained as historical audit evidence, not current deployment claims.

| Finding | Implemented correction |
| --- | --- |
| 1. Corrected scores | Old graphics are marked **Scores changed—review needed**, removed from selection, and blocked by server approval and worker validation. Review opens the correct week. Corrected milestones can be recreated; sealed originals remain history. |
| 2. Bracketing | Removing different Day 2 players names the changes and requires confirmation; the existing Undo path receives the original fixture. |
| 3. Training defaults | New observations start with unanswered assessments; editing retains saved answers. |
| 4. Uncertain training save | The open form retains one command and receipt until its result is known, preventing an edited retry from becoming another create command. |
| 5. Invitation failure | Connection failures offer Retry and Sign in, retaining the invitation; invalid links are distinguished. |
| 6. Trial entry | Fresh login-page trial links use the existing product chooser. |
| 7. Failed artwork reload | Layout and photo-position drafts survive failed reloads; success is shown only after loading the saved version. |
| 8. Match form loading | Cancel and draft capture work immediately; Save waits for a successfully loaded match list, with retry on failure. |
| 9. Award-request recovery | Text, uploaded artwork references, choices and retry identity survive reopening. Confirmed submission clears the request draft. |
| 10. Joining identity | The invitation shows the signed-in email and offers **Use a different email**, preserving the invitation. |
| 11. Copy previous team | Cancelled and empty sources are skipped; eleven slots are normalised and the source grade/date is identified. |

Validation: 165 focused automated tests passed, including the earlier regression suite, isolated DOM flows, artwork modules and navigation. App/module/demo syntax and whitespace checks passed. Two database suites passed with synthetic records rolled back, covering score corrections, score reversions, identical reimports, permissions, weekly awards, current collections and stale-post rejection. The security-advisor comparison found no new findings. Migration `20261015205919_social_award_score_refresh_189.sql` was applied successfully.

Limits: this is not a complete signed-in visual walkthrough. The separate **Request a Coach Conversation** save path was not changed by the training fix. Training uncertainty protection covers the open form; it does not claim recovery after closing the browser. Automatic fixture synchronisation is not implemented here; API access and refresh limits remain prerequisites. Head of Selections authority/delegation, multiple usual grades, and existing saved theme/background priorities remain unchanged.

## Original audit — before these fixes

## What this review adds

Four parallel reviews found eleven further issues in selections, social graphics, coaching and onboarding. The strongest findings concern silent changes, misleading success or error messages, and unfinished work that cannot be recovered. These should take priority over cosmetic changes.

Each finding below was reproduced using the application's actual functions/modules with isolated DOM execution and sample data. External requests were mocked. No live club records, messages, payments or social posts were changed. No product code was changed or deployed during this follow-up.

The review remains **source and isolated runtime verification**, not a signed-in browser walkthrough. A local browser executable was still unavailable; no blocked browser or authentication surface was bypassed. The first review's spacing concerns still need visual confirmation.

## Release status at the original audit

- Public `main` remains release 187, commit `871a50c372e20b6cc99f8af6cfcaba3519b23a43`.
- Fresh downloads of live `app.html`, `app.js` and `player-of-week.js` match the release-187 file hashes.
- [PR #36](https://github.com/smid00771/batting-development-platform/pull/36) remains **open, draft and unmerged**, at `8d894946bfc641e231a8ebc858a71af07aa887fe`.
- Its earlier Back, recovery and social-layout fixes are prepared, not live. The 95-test result belongs to that first pass; this follow-up ran targeted reproductions for the additional findings.
- All eleven findings below remain in both release 187 and the draft 188 code. The cited source lines use draft 188; the relevant paths are unchanged by its fixes.

## Fix first: preserve deliberate choices and trustworthy facts

### 1. A corrected score leaves an old graphic ready to post

**Observed:** Confirm a century image showing 100, then change the imported performance to 104 with a new performance signature. After **Reload scores & graphics**, the old image still says **Ready for post**, remains selectable and reaches the post-review callback. The corrected player is hidden from **Needs creation**. If the performance no longer qualifies at all, the old graphic still remains ready.

The posting validation source checks award identity and image hash, but does not recheck the current performance signature after the image is sealed. This is a source finding about the server validation; no live post was attempted.

**Recommended:** Show **Scores changed — review needed**; require regeneration and confirmation before a new post can use that edition. Retain already-published originals as history. This makes the earlier Edit/replace proposal necessary for factual accuracy, not just convenience.

Sources: [candidate filtering and collection review](../social-awards.js#L21), [sealed editions](../supabase/migrations/20261015043427_socials_awards_178.sql#L74), [posting validation](../supabase/migrations/20261015094500_social_awards_current_collection_182.sql#L160).

### 2. Turning off bracketing silently replaces Day 2 players

**Observed:** With a two-day slot containing Day 1 player A and Day 2 player B, untick **Bracketing permitted** and save. The outgoing fixture becomes A on both days. There is no confirmation and no supplied undo history. Changing to a one-day match already has a warning, so the equivalent loss through the bracketing checkbox is inconsistent.

**Recommended:** Show the affected bracket partners before replacement, require a clear confirmation, and retain the original fixture for Undo. Keep the Head of Selections lock/delegation rules unchanged.

Source: [fixture submission](../app.js#L20245). Verified outgoing save payload; no live selection was changed.

### 3. A training observation can save assessments nobody selected

**Observed:** A new **Training observation** starts with **Mostly** and **Right shots to the right balls** selected. Clicking **Save observation** without touching the form sends both assessments with an empty note. Match observations correctly start unanswered.

**Recommended:** Start both training assessments blank and reuse the existing short validation asking for the two answers. Preserve actual saved answers when editing an observation.

Source: [training observation form](../app.js#L13811).

### 4. Retrying an uncertain training save can create a second command

**Observed:** Simulate a lost response to a new training observation. Edit the note and retry. The app sends another create command with a new receipt ID and no existing observation ID, without resolving the first command.

**Proven:** Two distinct create commands. **Risk, not a live database observation:** duplicate observations if the first command committed before its response was lost.

**Recommended:** Reuse the existing uncertain-save protection: resolve the original receipt, then apply subsequent edits to the returned observation. Check the similar **Request a Coach Conversation** path separately before claiming it is fixed.

Sources: [shared observation save handler](../app.js#L13777), [training invocation](../app.js#L14000), [related conversation path](../app.js#L11398).

## Remove dead ends and misleading feedback

### 5. A temporary player-signup failure is called an invalid link

**Observed:** A simulated connection failure during the player-invitation lookup renders **This player link is no longer valid**, with zero buttons or links. A player cannot retry or sign in from that result and is likely to ask a volunteer for another invitation.

**Recommended:** Distinguish lookup failure from a genuinely missing/invalid invitation. Offer **Try again** and **Sign in**, preserving the invitation.

Source: [player invitation lookup](../app.js#L2631).

### 6. The login page still sends new clubs into the old trial route

**Observed:** **New club? Try it free with your club** opens `?trial=1`, showing the old batting-only 60-day form. It has no Teams/Both choice and no scheduled trial-start field. The newer product-aware route already exists.

**Recommended:** Point fresh trial links at the existing product chooser. Preserve legacy invitation/confirmation handling instead of deleting the older route indiscriminately.

Sources: [login link](../app.js#L1306), [legacy form](../app.js#L1448), [current product-aware flow](../app.js#L21087).

### 7. Results reports a saved layout reload even when the read fails

**Observed:** Change Results **Title height** from 9 to 25, fail the context read, and click **Reload saved layout**. The screen reports **Saved layout reloaded** and **Layout saved**, still displays 25, and clears the dirty flag. The next successful scores reload silently replaces the draft with the saved value 9.

**Recommended:** Preserve dirty state until a replacement has loaded successfully. On failure, say **Could not reload — your changes are still here**. The analogous **Reload saved photo position** code needs the same treatment; that shared pattern was inspected in source, not separately reproduced.

Sources: [load error handling](../social-awards.js#L21), [layout reload](../social-awards.js#L80), [photo-position reload](../social-awards.js#L92).

### 8. Prepare for a match displays enabled controls before they work

**Observed:** Hold the fixture-list request pending after opening **My Innings → Prepare for a match**. **Save preparation** and **Cancel** are visibly enabled but have no handlers. Clicking Cancel does nothing. Both start working only after the fixture response arrives. The same setup sequence also affects innings entry.

**Recommended:** Bind Cancel immediately. Disable Save with a brief loading state until the match identity is ready. Attach draft capture before asynchronous dependencies so early typing is protected.

Sources: [form wiring order](../app.js#L12172), [asynchronous fixture picker](../app.js#L12546).

## Smaller recovery improvements

### 9. A new award request is lost on refresh without warning

**Observed:** Type an award name and criteria. The unsaved-change check returns false, navigation is permitted, and recreating the page state loses the request. The current draft persistence saves the week, caption and selected images, not the request.

**Recommended:** Save request text and already-uploaded artwork references under the existing club/user draft key. Clear only after confirmed submission and include the request in unsaved-work checks. Do not imply that an unuploaded local file itself has been saved.

Sources: [draft persistence](../social-awards.js#L16), [request edits and leave checks](../social-awards.js#L146), [app unload guard](../app.js#L22271).

### 10. A signed-in player cannot see which account is joining

**Observed:** The invitation page shows a member name and **Join [club]**, but no account email and no switch-account action. A sample signed-in email was absent from the rendered page. This establishes confusing account identity, not a proven backend linkage failure.

**Recommended:** Show the signed-in email and **Use a different email**, keeping the invitation intact. The trial flow already has a comparable pattern.

Source: [signed-in invitation form](../app.js#L2695).

### 11. Copy previous team can choose a cancelled fixture

**Observed:** A played fixture is followed by a more recent cancelled fixture. **Copy previous team** chooses the cancelled one. In a sample where its published slots are empty, it sends an empty slots array rather than the earlier played XI. The outgoing payload is verified; backend acceptance was not tested.

**Recommended:** Skip cancelled sources, validate/normalise the eleven slots, and identify the source match/date so the selector can understand the result.

Source: [Copy previous team](../app.js#L20641).

## Keep fixture connection the next major time-saver

An important existing capability was confirmed: **Prepare for a match already has a Match selector that reuses published fixture date, format and opposition.** Automatic PlayCricket fixtures should feed that existing record and journey, not add another match-entry page.

The proposed club experience remains one connection per team/competition/season, then automatic upcoming fixtures and an exceptions list for meaningful changes. Credentialed PlayHQ access and refresh limits still need confirmation; this review did not establish access or implement a synchronisation job.

Before implementing it, preserve stable match identities, recheck availability on date changes, retain intentional local instructions, distinguish cancellations from missing responses, and keep published selections under the existing authority. The new bracketing and cancelled-copy findings show why those protections matter.

The most useful implementation order is: protect facts and selections; remove false success and dead ends; then connect fixtures and reuse them across existing workflows. Keep the first-pass visual simplifications on the list, with rendered verification before broad layout changes.
