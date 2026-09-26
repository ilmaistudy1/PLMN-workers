-- Enforce that users can update their own phone only; admins retain existing profile management.

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() = old.id then
    if new.account_status is distinct from old.account_status
      or new.full_name is distinct from old.full_name then
      raise exception 'Users cannot change their own account status or name through profile update.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
before update on public.profiles
for each row execute function private.guard_profile_update();

drop policy if exists profiles_self_phone_update on public.profiles;
create policy profiles_self_phone_update
on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
