-- Fix Prompt 2 operator-precedence issue so every member write is area-scoped.
create or replace function private.user_can_manage_members(p_user_id uuid, p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (
      private.user_has_role(p_user_id, 'super_admin')
      or private.user_has_role(p_user_id, 'admin')
      or private.user_has_role(p_user_id, 'area_manager')
      or private.user_has_role(p_user_id, 'data_entry')
    )
    and private.user_can_access_area(p_user_id, p_area_id);
$$;