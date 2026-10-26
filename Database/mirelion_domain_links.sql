-- Run only after https://mirelionhq.com/app.html is serving the shared application.
-- Preserve function signatures, grants, calendar tokens and stable event UIDs.
begin;
do $migration$
declare item record; definition text;
begin
 for item in select * from (values
  ('club_selection_private.refresh_calendar_events(uuid)','https://clubbatting.com/app.html','https://mirelionhq.com/app.html'),
  ('club_selection_private.run_availability_reminders(timestamp with time zone)','https://clubbatting.com/app.html','https://mirelionhq.com/app.html'),
  ('club_selection_private.week_api(uuid,text,jsonb)','https://clubbatting.com/app.html','https://mirelionhq.com/app.html'),
  ('public.begin_public_club_trial(text,text)','enquiries@clubbatting.com','enquiries@mirelionhq.com')
 ) as changes(signature,old_value,new_value)
 loop
  if to_regprocedure(item.signature) is null then raise exception 'Missing migration prerequisite: %',item.signature;end if;
  definition:=pg_get_functiondef(to_regprocedure(item.signature));
  if position(item.old_value in definition)>0 then execute replace(definition,item.old_value,item.new_value);
  elsif position(item.new_value in definition)=0 then raise exception 'Unexpected URL implementation: %',item.signature;
  end if;
 end loop;
end
$migration$;
update club_selection_private.calendar_events
set event=jsonb_set(event,'{url}',to_jsonb(replace(event->>'url','https://clubbatting.com/app.html','https://mirelionhq.com/app.html'))),
    sequence=sequence+1,updated_at=now()
where event->>'url' like 'https://clubbatting.com/app.html?%';
commit;
