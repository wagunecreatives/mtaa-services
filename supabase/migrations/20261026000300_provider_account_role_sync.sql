update public.profiles profile
set role = 'provider',
    onboarding_completed = case
      when exists (
        select 1 from public.providers provider
        where provider.id = profile.id
      ) then profile.onboarding_completed
      else false
    end,
    updated_at = now()
where profile.role = 'customer'
  and profile.account_type = 'provider';
