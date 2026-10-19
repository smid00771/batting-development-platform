-- Keep per-message checks and per-fixture calendar refreshes bounded as clubs accumulate history.
create index availability_reminders_message on club_selection_private.availability_reminders(message_id) where message_id is not null;
create index availability_reminders_pending on club_selection_private.availability_reminders(club_id,user_id) where cancelled_at is null;
create index calendar_events_fixture on club_selection_private.calendar_events(fixture_id);
