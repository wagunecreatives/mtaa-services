-- Make provider-response notifications useful at a glance while keeping
-- customer request details private to the notification recipient.
create or replace function public.notify_provider_response()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  n_id uuid;
  recipient uuid;
  category_name text;
  area_name text;
  provider_label text;
begin
  select sr.customer_id,sc.name,sr.area_name
    into recipient,category_name,area_name
  from public.service_requests sr
  join public.service_categories sc on sc.id=sr.category_id
  where sr.id=new.request_id;a
  if recipient is null then return new; end if;

  provider_label:=case lower(coalesce(category_name,''))
    when 'plumbing' then 'plumber'
    when 'electrical' then 'electrician'
    when 'cleaning' then 'cleaner'
    when 'carpentry' then 'carpenter'
    else lower(coalesce(category_name,'service'))||' provider'
  end;

  begin
    insert into public.notifications(recipient_id,event_type,request_id,match_id,event_key,title,body,data)
    values(recipient,'provider_response',new.request_id,new.match_id,'response:'||new.id::text,
      'Provider response',
      'A '||provider_label||' near '||coalesce(nullif(btrim(area_name),''),'your area')||' is available for your request.',
      jsonb_build_object('screen','/(customer)/requests','requestId',new.request_id::text))
    on conflict(event_key) do nothing returning id into n_id;
    if n_id is not null then
      insert into public.notification_outbox(notification_id) values(n_id) on conflict do nothing;
    end if;
  exception when others then
    raise warning 'Provider response notification enqueue failed for response %: %',new.id,sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.notify_provider_response() from public,anon,authenticated;
