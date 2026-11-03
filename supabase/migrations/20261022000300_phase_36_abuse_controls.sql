-- Phase 36: add interaction rate limits and a user-facing block list.

create or replace function public.guard_marketplace_activity_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activity_user uuid;
begin
  if tg_table_name = 'provider_responses' then
    activity_user := new.provider_id;
    perform pg_advisory_xact_lock(hashtextextended(activity_user::text, 3));
    if (
      select count(*) from public.provider_responses
      where provider_id = activity_user
        and created_at > now() - interval '1 hour'
    ) >= 20 then
      raise exception 'Response limit reached. Please try again later.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'job_disputes' then
    activity_user := new.raised_by;
    perform pg_advisory_xact_lock(hashtextextended(activity_user::text, 4));
    if (
      select count(*) from public.job_disputes
      where raised_by = activity_user
        and created_at > now() - interval '1 day'
    ) >= 3 then
      raise exception 'Daily dispute report limit reached.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_marketplace_activity_rate() from public, anon, authenticated;

drop trigger if exists provider_responses_rate_guard on public.provider_responses;
create trigger provider_responses_rate_guard
before insert on public.provider_responses
for each row execute function public.guard_marketplace_activity_rate();

drop trigger if exists job_disputes_rate_guard on public.job_disputes;
create trigger job_disputes_rate_guard
before insert on public.job_disputes
for each row execute function public.guard_marketplace_activity_rate();

create or replace function public.prevent_recycled_review_text()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_text text;
begin
  normalized_text := lower(regexp_replace(btrim(coalesce(new.review_text, new.comment, '')), '\s+', ' ', 'g'));
  if normalized_text = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text, 2));
  if exists (
    select 1
    from public.reviews review
    where review.customer_id = new.customer_id
      and review.created_at > now() - interval '30 days'
      and lower(regexp_replace(btrim(coalesce(review.review_text, review.comment, '')), '\s+', ' ', 'g')) = normalized_text
  ) then
    raise exception 'Please write an original review based on this completed job.' using errcode = '22023';
  end if;

  return new;
end;
$$;
revoke all on function public.prevent_recycled_review_text() from public, anon, authenticated;
drop trigger if exists reviews_recycled_text_guard on public.reviews;
create trigger reviews_recycled_text_guard
before insert on public.reviews
for each row execute function public.prevent_recycled_review_text();

create or replace function public.list_blocked_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', blocked.id,
      'full_name', blocked.full_name,
      'business_name', provider.business_name,
      'role', blocked.role,
      'blocked_at', block.created_at
    ) order by block.created_at desc)
    from public.user_blocks block
    join public.profiles blocked on blocked.id = block.blocked_id
    left join public.providers provider on provider.id = blocked.id
    where block.blocker_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_blocked_users() from public, anon;
grant execute on function public.list_blocked_users() to authenticated;
