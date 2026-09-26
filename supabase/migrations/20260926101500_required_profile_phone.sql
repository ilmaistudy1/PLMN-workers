-- PLMN Workers: require a phone number alongside email/password authentication.

alter table public.profiles
  add column if not exists phone text;

create index if not exists profiles_phone_idx
  on public.profiles(phone);

alter table public.profiles
  drop constraint if exists profiles_phone_format_check;

alter table public.profiles
  add constraint profiles_phone_format_check
  check (
    phone is null
    or phone ~ '^\\+[1-9][0-9]{9,14}$'
  );

revoke update on public.profiles from authenticated;
grant update (full_name, account_status, phone) on public.profiles to authenticated;

create or replace function private.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  changed_fields jsonb := '{}'::jsonb;
begin
  if new.account_status is distinct from old.account_status then
    changed_fields := changed_fields || jsonb_build_object('account_status', new.account_status);
  end if;

  if new.full_name is distinct from old.full_name then
    changed_fields := changed_fields || jsonb_build_object('full_name_changed', true);
  end if;

  if new.phone is distinct from old.phone then
    changed_fields := changed_fields || jsonb_build_object('phone_changed', true);
  end if;

  if changed_fields <> '{}'::jsonb then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      case
        when new.account_status is distinct from old.account_status then 'account_status_changed'
        when new.phone is distinct from old.phone then 'phone_updated'
        else 'profile_updated'
      end,
      'user',
      new.id,
      changed_fields
    );
  end if;

  return new;
end;
$$;

comment on column public.profiles.phone is
  'Required application contact number stored in normalized international format. Email/password remains the authentication method; SMS OTP is not used.';
