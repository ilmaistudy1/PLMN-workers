-- Extend member search to include optional Union Council.

drop function if exists public.search_members(text, uuid, uuid, text, text, integer, integer);

create function public.search_members(
  p_search text default null,
  p_area_id uuid default null,
  p_member_role_id uuid default null,
  p_status text default null,
  p_level text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  full_name text,
  primary_phone text,
  alternate_phone text,
  address_details text,
  area_id uuid,
  area_name text,
  area_level text,
  uc_id uuid,
  uc_name text,
  uc_level text,
  member_role_id uuid,
  member_role_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with recursive selected_area_tree as (
    select a.id
    from public.areas a
    where p_area_id is not null
      and a.id = p_area_id
    union all
    select child.id
    from public.areas child
    join selected_area_tree parent on child.parent_id = parent.id
    where p_area_id is not null
  ),
  filtered as (
    select
      m.id,
      m.full_name,
      m.primary_phone,
      m.alternate_phone,
      m.address_details,
      m.area_id,
      a.name as area_name,
      a.level as area_level,
      m.uc_id,
      uc.name as uc_name,
      uc.level as uc_level,
      m.member_role_id,
      mr.name as member_role_name,
      m.status,
      m.created_at,
      m.updated_at
    from public.members m
    join public.areas a on a.id = m.area_id
    join public.member_roles mr on mr.id = m.member_role_id
    left join public.areas uc on uc.id = m.uc_id
    where
      (
        p_search is null
        or length(btrim(p_search)) = 0
        or lower(m.full_name) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(m.primary_phone, '')) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(m.alternate_phone, '')) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(a.name, '')) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(uc.name, '')) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(mr.name, '')) like '%' || lower(btrim(p_search)) || '%'
      )
      and (p_area_id is null or m.area_id in (select id from selected_area_tree))
      and (p_member_role_id is null or m.member_role_id = p_member_role_id)
      and (p_status is null or m.status = p_status)
      and (p_level is null or a.level = p_level)
  )
  select
    f.*,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc, f.id
  offset greatest(p_page - 1, 0) * least(greatest(p_page_size, 1), 100)
  limit least(greatest(p_page_size, 1), 100);
$$;

grant execute on function public.search_members(text, uuid, uuid, text, text, integer, integer)
  to authenticated;
revoke execute on function public.search_members(text, uuid, uuid, text, text, integer, integer)
  from anon;
