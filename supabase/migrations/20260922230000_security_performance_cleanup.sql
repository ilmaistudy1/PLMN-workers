-- Prompt 3 security/performance cleanup.
-- Keep search/stat RPCs callable only by authenticated users.
revoke execute on function public.search_members(text, uuid, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.search_members(text, uuid, uuid, text, text, integer, integer) to authenticated;

revoke execute on function public.get_member_dashboard_stats() from public, anon;
grant execute on function public.get_member_dashboard_stats() to authenticated;

-- Keep pg_trgm out of the API-exposed public schema when the extensions schema exists.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end $$;

create index if not exists areas_created_by_idx on public.areas(created_by);
create index if not exists member_roles_created_by_idx on public.member_roles(created_by);
create index if not exists members_created_by_idx on public.members(created_by);
create index if not exists members_updated_by_idx on public.members(updated_by);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select to authenticated
using (
  (select auth.uid()) = id
  or private.is_super_admin((select auth.uid()))
  or private.is_admin((select auth.uid()))
);

drop policy if exists profiles_manage on public.profiles;
create policy profiles_manage
on public.profiles
for update to authenticated
using (private.can_manage_user((select auth.uid()), id))
with check (private.can_manage_user((select auth.uid()), id));

drop policy if exists roles_select on public.roles;
create policy roles_select
on public.roles
for select to authenticated
using (private.user_has_any_role((select auth.uid())));

drop policy if exists roles_manage on public.roles;
create policy roles_insert
on public.roles for insert to authenticated
with check (private.is_super_admin((select auth.uid())));
create policy roles_update
on public.roles for update to authenticated
using (private.is_super_admin((select auth.uid())))
with check (private.is_super_admin((select auth.uid())));
create policy roles_delete
on public.roles for delete to authenticated
using (private.is_super_admin((select auth.uid())));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select
on public.user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.can_manage_user((select auth.uid()), user_id)
);

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert
on public.user_roles
for insert to authenticated
with check (
  private.can_manage_user((select auth.uid()), user_id)
  and private.role_is_assignable((select auth.uid()), role_id)
);

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update
on public.user_roles
for update to authenticated
using (private.can_manage_user((select auth.uid()), user_id))
with check (
  private.can_manage_user((select auth.uid()), user_id)
  and private.role_is_assignable((select auth.uid()), role_id)
);

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete
on public.user_roles
for delete to authenticated
using (private.can_manage_user((select auth.uid()), user_id));

drop policy if exists user_area_assignments_select on public.user_area_assignments;
create policy user_area_assignments_select
on public.user_area_assignments
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.can_manage_user((select auth.uid()), user_id)
);

drop policy if exists user_area_assignments_insert on public.user_area_assignments;
create policy user_area_assignments_insert
on public.user_area_assignments
for insert to authenticated
with check (
  private.can_manage_user((select auth.uid()), user_id)
  and private.user_can_access_area((select auth.uid()), area_id)
  and private.area_is_active(area_id)
);

drop policy if exists user_area_assignments_update on public.user_area_assignments;
create policy user_area_assignments_update
on public.user_area_assignments
for update to authenticated
using (private.can_manage_user((select auth.uid()), user_id))
with check (
  private.can_manage_user((select auth.uid()), user_id)
  and private.user_can_access_area((select auth.uid()), area_id)
  and private.area_is_active(area_id)
);

drop policy if exists user_area_assignments_delete on public.user_area_assignments;
create policy user_area_assignments_delete
on public.user_area_assignments
for delete to authenticated
using (private.can_manage_user((select auth.uid()), user_id));

drop policy if exists areas_select on public.areas;
create policy areas_select
on public.areas
for select to authenticated
using (
  private.user_has_any_role((select auth.uid()))
  and private.user_can_access_area((select auth.uid()), id)
);

drop policy if exists areas_insert on public.areas;
create policy areas_insert
on public.areas
for insert to authenticated
with check (
  private.is_super_admin((select auth.uid()))
  or (
    private.is_admin((select auth.uid()))
    and private.user_can_manage_area_parent((select auth.uid()), parent_id)
  )
);

drop policy if exists areas_update on public.areas;
create policy areas_update
on public.areas
for update to authenticated
using (private.user_can_manage_area((select auth.uid()), id))
with check (
  (
    private.is_super_admin((select auth.uid()))
    and (parent_id is null or private.area_is_active(parent_id))
  )
  or (
    private.is_admin((select auth.uid()))
    and private.user_can_manage_area_parent((select auth.uid()), parent_id)
  )
);

drop policy if exists areas_delete on public.areas;
create policy areas_delete
on public.areas
for delete to authenticated
using (private.is_super_admin((select auth.uid())));

drop policy if exists member_roles_select on public.member_roles;
create policy member_roles_select
on public.member_roles
for select to authenticated
using (private.user_has_any_role((select auth.uid())));

drop policy if exists member_roles_manage on public.member_roles;
create policy member_roles_insert
on public.member_roles for insert to authenticated
with check (private.is_super_admin((select auth.uid())) or private.is_admin((select auth.uid())));
create policy member_roles_update
on public.member_roles for update to authenticated
using (private.is_super_admin((select auth.uid())) or private.is_admin((select auth.uid())))
with check (private.is_super_admin((select auth.uid())) or private.is_admin((select auth.uid())));
create policy member_roles_delete
on public.member_roles for delete to authenticated
using (private.is_super_admin((select auth.uid())) or private.is_admin((select auth.uid())));

drop policy if exists members_select on public.members;
create policy members_select
on public.members
for select to authenticated
using (
  private.user_has_any_role((select auth.uid()))
  and private.user_can_access_area((select auth.uid()), area_id)
);

drop policy if exists members_insert on public.members;
create policy members_insert
on public.members
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.user_can_manage_members((select auth.uid()), area_id)
  and private.area_is_active(area_id)
  and private.member_role_is_active(member_role_id)
);

drop policy if exists members_update on public.members;
create policy members_update
on public.members
for update to authenticated
using (private.user_can_manage_members((select auth.uid()), area_id))
with check (
  private.user_can_manage_members((select auth.uid()), area_id)
  and private.area_is_active(area_id)
  and private.member_role_is_active(member_role_id)
);

drop policy if exists members_delete on public.members;
create policy members_delete
on public.members
for delete to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or (
    private.is_admin((select auth.uid()))
    and private.user_can_access_area((select auth.uid()), area_id)
  )
);

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select
on public.audit_logs
for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or (
    private.is_admin((select auth.uid()))
    and area_id is not null
    and private.user_can_access_area((select auth.uid()), area_id)
  )
);