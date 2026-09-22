-- Prompt 4: admin experience, account status enforcement, audit visibility and secure role mutation.

create or replace function private.user_account_is_active(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.profiles where id = p_user_id and account_status = 'active');
$$;

create or replace function private.user_has_role(p_user_id uuid, p_role_code text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.user_account_is_active(p_user_id)
    and exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id and r.code = p_role_code and r.is_active = true
    );
$$;

create or replace function private.user_has_any_role(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.user_account_is_active(p_user_id)
    and exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id and r.is_active = true
    );
$$;

create or replace function private.user_highest_role_rank(p_user_id uuid)
returns smallint language sql stable security definer
set search_path = pg_catalog, public
as $
  select coalesce((
    select max(r.rank)::smallint
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.is_active = true
  ), 0)::smallint;
$;

create or replace function private.user_can_access_area_in_scope(p_user_id uuid, p_area_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  with recursive scoped_areas as (
    select uaa.area_id from public.user_area_assignments uaa where uaa.user_id = p_user_id
    union
    select a.id from public.areas a join scoped_areas s on a.parent_id = s.area_id
  )
  select private.user_account_is_active(p_user_id)
    and (private.is_super_admin(p_user_id)
      or exists (select 1 from scoped_areas s where s.area_id = p_area_id));
$$;

create or replace function private.user_can_access_area(p_user_id uuid, p_area_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.user_can_access_area_in_scope(p_user_id, p_area_id) and private.area_is_active(p_area_id);
$$;

create or replace function private.user_can_manage_area(p_user_id uuid, p_area_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.is_super_admin(p_user_id)
    or (private.is_admin(p_user_id) and private.user_can_access_area_in_scope(p_user_id, p_area_id));
$$;

create or replace function private.user_can_manage_members(p_user_id uuid, p_area_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.user_account_is_active(p_user_id)
    and (
      private.user_has_role(p_user_id, 'super_admin')
      or private.user_has_role(p_user_id, 'admin')
      or private.user_has_role(p_user_id, 'area_manager')
      or private.user_has_role(p_user_id, 'data_entry')
    )
    and private.user_can_access_area_in_scope(p_user_id, p_area_id);
$$;

create or replace function private.member_update_area_allowed(p_user_id uuid, p_member_id uuid, p_new_area_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.user_can_manage_members(p_user_id, p_new_area_id)
    and (
      private.area_is_active(p_new_area_id)
      or exists (
        select 1 from public.members m where m.id = p_member_id and m.area_id = p_new_area_id
      )
    );
$$;

create or replace function private.prevent_area_deactivation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if old.is_active = true and new.is_active = false then
    if exists (select 1 from public.areas child where child.parent_id = new.id and child.is_active = true)
      then raise exception 'Cannot deactivate an area with active child areas'; end if;
    if exists (select 1 from public.members m where m.area_id = new.id and m.status <> 'archived')
      then raise exception 'Cannot deactivate an area with non-archived members'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists areas_prevent_deactivation on public.areas;
create trigger areas_prevent_deactivation before update of is_active on public.areas
for each row execute function private.prevent_area_deactivation();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using ((select auth.uid()) = id or private.can_manage_user((select auth.uid()), id));

drop policy if exists profiles_manage on public.profiles;
create policy profiles_manage on public.profiles for update to authenticated
using (private.can_manage_user((select auth.uid()), id))
with check (private.can_manage_user((select auth.uid()), id));

drop policy if exists areas_select on public.areas;
create policy areas_select on public.areas for select to authenticated
using (private.user_has_any_role((select auth.uid()))
  and private.user_can_access_area_in_scope((select auth.uid()), id));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
using (private.user_has_any_role((select auth.uid()))
  and private.user_can_access_area_in_scope((select auth.uid()), area_id));

drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.user_can_manage_members((select auth.uid()), area_id)
  and private.area_is_active(area_id)
  and private.member_role_is_active(member_role_id)
);

drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
using (private.user_can_manage_members((select auth.uid()), area_id))
with check (
  private.member_update_area_allowed((select auth.uid()), id, area_id)
  and private.member_role_is_active(member_role_id)
);

drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete to authenticated
using (
  (private.is_super_admin((select auth.uid())) or private.is_admin((select auth.uid())))
  and private.user_can_access_area_in_scope((select auth.uid()), area_id)
);

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or private.can_manage_user((select auth.uid()), user_id));

drop policy if exists user_area_assignments_select on public.user_area_assignments;
create policy user_area_assignments_select on public.user_area_assignments for select to authenticated
using (user_id = (select auth.uid()) or private.can_manage_user((select auth.uid()), user_id));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or actor_user_id = (select auth.uid())
  or (
    private.is_admin((select auth.uid()))
    and (
      (area_id is not null and private.user_can_access_area_in_scope((select auth.uid()), area_id))
      or (entity_type = 'user' and entity_id is not null and private.can_manage_user((select auth.uid()), entity_id))
    )
  )
);

create or replace function private.audit_profile_changes()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare changed_fields jsonb := '{}'::jsonb;
begin
  if new.account_status is distinct from old.account_status
    then changed_fields := changed_fields || jsonb_build_object('account_status', new.account_status); end if;
  if new.full_name is distinct from old.full_name
    then changed_fields := changed_fields || jsonb_build_object('full_name_changed', true); end if;

  if changed_fields <> '{}'::jsonb then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      case when new.account_status is distinct from old.account_status then 'account_status_changed' else 'profile_updated' end,
      'user', new.id, changed_fields
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_profile_changes on public.profiles;
create trigger audit_profile_changes after update on public.profiles
for each row execute function private.audit_profile_changes();

create or replace function private.audit_user_role_changes()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare affected_user uuid := coalesce(new.user_id, old.user_id); affected_role uuid := coalesce(new.role_id, old.role_id); role_code text;
begin
  select r.code into role_code from public.roles r where r.id = affected_role;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'user_role_changed', 'user', affected_user,
    jsonb_build_object('operation', tg_op, 'role_id', affected_role, 'role_code', role_code));
  return coalesce(new, old);
end;
$$;

create or replace function private.audit_user_area_changes()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare affected_user uuid := coalesce(new.user_id, old.user_id); affected_area uuid := coalesce(new.area_id, old.area_id); area_name text;
begin
  select a.name into area_name from public.areas a where a.id = affected_area;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
  values (auth.uid(), 'area_changed', 'user_area_assignment', affected_user, affected_area,
    jsonb_build_object('operation', tg_op, 'area_id', affected_area, 'area_name', area_name));
  return coalesce(new, old);
end;
$$;

create or replace function public.set_user_application_role(p_user_id uuid, p_role_id uuid)
returns void language plpgsql security invoker
set search_path = public, private, pg_catalog
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_user((select auth.uid()), p_user_id) then raise exception 'You cannot manage this account'; end if;
  if not private.role_is_assignable((select auth.uid()), p_role_id) then raise exception 'You cannot assign this application role'; end if;
  if not exists (select 1 from public.roles where id = p_role_id and is_active = true)
    then raise exception 'Selected application role is inactive'; end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles(user_id, role_id) values (p_user_id, p_role_id);
end;
$$;

revoke all on function public.set_user_application_role(uuid, uuid) from public, anon;
grant execute on function public.set_user_application_role(uuid, uuid) to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, account_status) on public.profiles to authenticated;

grant usage on schema private to authenticated;
grant execute on function
  private.user_account_is_active(uuid),
  private.user_has_role(uuid, text),
  private.user_has_any_role(uuid),
  private.user_highest_role_rank(uuid),
  private.is_super_admin(uuid),
  private.is_admin(uuid),
  private.can_manage_user(uuid, uuid),
  private.role_is_assignable(uuid, uuid),
  private.area_is_active(uuid),
  private.user_can_access_area_in_scope(uuid, uuid),
  private.user_can_access_area(uuid, uuid),
  private.user_can_manage_area(uuid, uuid),
  private.user_can_manage_area_parent(uuid, uuid),
  private.member_role_is_active(uuid),
  private.user_can_manage_members(uuid, uuid),
  private.member_update_area_allowed(uuid, uuid, uuid)
to authenticated;

create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_email_lower_idx on public.profiles(lower(email));
create index if not exists audit_logs_action_created_at_idx on public.audit_logs(action, created_at desc);
create index if not exists audit_logs_entity_created_at_idx on public.audit_logs(entity_type, created_at desc);
create index if not exists audit_logs_entity_id_idx on public.audit_logs(entity_id);

comment on function public.set_user_application_role(uuid, uuid)
is 'Atomically replaces a subordinate application role after server-side authority checks.';
