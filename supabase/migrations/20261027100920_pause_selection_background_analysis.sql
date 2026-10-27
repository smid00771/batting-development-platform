-- Emergency pause for optional work on every Selection Board context read.
-- Keep save/publish validation, permissions, locks and stored conversations intact.
do $pause$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,$old0$if p_action in ('access','context') and club_selection_private.member(c,me) and club_selection_private.enabled(c) then$old0$,'')))/length($old0$if p_action in ('access','context') and club_selection_private.member(c,me) and club_selection_private.enabled(c) then$old0$)<>1 then raise exception 'Unexpected selections API shape at change 0';end if;
 definition:=replace(definition,$old0$if p_action in ('access','context') and club_selection_private.member(c,me) and club_selection_private.enabled(c) then$old0$,$new0$if p_action='access' and club_selection_private.member(c,me) and club_selection_private.enabled(c) then$new0$);
 if (length(definition)-length(replace(definition,$old1$  if p_action='context' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c);end if;$old1$,'')))/length($old1$  if p_action='context' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c);end if;$old1$)<>1 then raise exception 'Unexpected selections API shape at change 1';end if;
 definition:=replace(definition,$old1$  if p_action='context' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c);end if;$old1$,$new1$$new1$);
 if (length(definition)-length(replace(definition,$old2$'conversations',club_selection_private.conversation_context(c,me),$old2$,'')))/length($old2$'conversations',club_selection_private.conversation_context(c,me),$old2$)<>1 then raise exception 'Unexpected selections API shape at change 2';end if;
 definition:=replace(definition,$old2$'conversations',club_selection_private.conversation_context(c,me),$old2$,$new2$'conversations','[]'::jsonb,$new2$);
 if (length(definition)-length(replace(definition,$old3$'issues',club_selection_private.issues(f.id),$old3$,'')))/length($old3$'issues',club_selection_private.issues(f.id),$old3$)<>1 then raise exception 'Unexpected selections API shape at change 3';end if;
 definition:=replace(definition,$old3$'issues',club_selection_private.issues(f.id),$old3$,$new3$'issues','[]'::jsonb,$new3$);
 execute definition;
end $pause$;
