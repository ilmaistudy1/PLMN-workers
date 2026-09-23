-- Prompt 5: final production hardening.
-- Keeps stale member records editable while requiring active roles for new role assignments.
-- Tightens active-parent rules and removes unnecessary Data API table grants.

create or replace function private.member_update_role_allowed(p_member_id uuid, p_new_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.member_role_is_active(p_new_role_id)
    or exists (
      select 1 from public.members m
      where m.id = p_member_id
        and m.member_role_id = p_new_role_id
    );
$$;

revoke execute on function private.member_update_role_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function private.member_update_role_allowed(uuid, uuid) to authenticated;

drop policy if exists members_update on public.members;
create policy members_update
on public.members
for update to authenticated
using (private.user_can_manage_members((select auth.uid()), area_id))
with check (
  private.member_update_area_allowed((select auth.uid()), id, area_id)
  and private.member_update_role_allowed(id, member_role_id)
);

drop policy if exists areas_insert on public.areas;
create policy areas_insert
on public.areas
for insert to authenticated
with check (
  private.is_super_admin((select auth.uid()))
  or (
    private.is_admin((select auth.uid()))
    and parent_id is not null
    and private.area_is_active(parent_id)
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
    and parent_id is not null
    and private.area_is_active(parent_id)
    and private.user_can_manage_area_parent((select auth.uid()), parent_id)
  )
);

revoke all on table
  public.profiles,
  public.roles,
  public.user_roles,
  public.user_area_assignments,
  public.areas,
  public.member_roles,
  public.members,
  public.audit_logs
from authenticated;

grant select on public.profiles to authenticated;
grant update(full_name, account_status) on public.profiles to authenticated;

grant select on public.roles to authenticated;

grant select, insert, delete on public.user_roles to authenticated;
grant select, insert, delete on public.user_area_assignments to authenticated;

grant select, insert, update on public.areas to authenticated;
grant select, insert, update on public.member_roles to authenticated;
grant select, insert, update on public.members to authenticated;
grant select on public.audit_logs to authenticated;
