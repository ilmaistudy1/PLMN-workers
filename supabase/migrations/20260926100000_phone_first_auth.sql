-- PLMN Workers: phone-first authentication profile support

alter table public.profiles
  add column if not exists phone text;

create unique index if not exists profiles_phone_unique_idx
  on public.profiles(phone)
  where phone is not null and btrim(phone) <> '';

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.phone,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        updated_at = now();

  return new;
end;
$$;

create or replace function private.sync_auth_user_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.email is distinct from old.email or new.phone is distinct from old.phone then
    update public.profiles
    set email = new.email,
        phone = new.phone,
        updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated_plmn on auth.users;
drop trigger if exists on_auth_user_identity_updated_plmn on auth.users;

create trigger on_auth_user_identity_updated_plmn
after update of email, phone on auth.users
for each row execute function private.sync_auth_user_identity();

comment on column public.profiles.phone is 'Verified Supabase Auth phone number mirrored for application user management. Email remains optional.';
