create table if not exists public.user_policy_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.user_policy_acceptances enable row level security;
revoke all on public.user_policy_acceptances from public, anon, authenticated;
grant select on public.user_policy_acceptances to authenticated;

drop policy if exists "Users can view their own policy acceptance" on public.user_policy_acceptances;
create policy "Users can view their own policy acceptance"
  on public.user_policy_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.record_signup_user_policy_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.raw_user_meta_data ->> 'user_policy_accepted' is distinct from 'true'
     or new.raw_user_meta_data ->> 'user_policy_version' is distinct from '2026-11-04' then
    raise exception 'Accept the current MTAA SERVICES Terms of Use and User Policy before creating an account'
      using errcode = '22023';
  end if;

  insert into public.user_policy_acceptances(user_id, policy_version)
  values (new.id, '2026-11-04');
  return new;
end;
$$;
revoke all on function public.record_signup_user_policy_acceptance() from public, anon, authenticated;

drop trigger if exists zzzzz_record_signup_user_policy_acceptance on auth.users;
create trigger zzzzz_record_signup_user_policy_acceptance
  after insert on auth.users
  for each row execute function public.record_signup_user_policy_acceptance();

create or replace function public.accept_current_user_policy(p_policy_version text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_policy_version is distinct from '2026-11-04' then
    raise exception 'The current Terms of Use and User Policy version is required'
      using errcode = '22023';
  end if;

  insert into public.user_policy_acceptances(user_id, policy_version, accepted_at)
  values (auth.uid(), p_policy_version, now())
  on conflict (user_id) do update
    set policy_version = excluded.policy_version,
        accepted_at = excluded.accepted_at;
  return true;
end;
$$;
revoke all on function public.accept_current_user_policy(text) from public, anon;
grant execute on function public.accept_current_user_policy(text) to authenticated;
