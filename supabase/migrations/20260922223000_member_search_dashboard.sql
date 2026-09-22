create extension if not exists pg_trgm;

alter table public.members
  add column if not exists primary_phone_normalized text
    generated always as (
      nullif(regexp_replace(coalesce(primary_phone, ''), '[^0-9]+', '', 'g'), '')
    ) stored,
  add column if not exists alternate_phone_normalized text
    generated always as (
      nullif(regexp_replace(coalesce(alternate_phone, ''), '[^0-9]+', '', 'g'), '')
    ) stored;

create index if not exists members_full_name_trgm_idx
  on public.members using gin (lower(full_name) gin_trgm_ops);

create index if not exists members_primary_phone_trgm_idx
  on public.members using gin (lower(coalesce(primary_phone,'')) gin_trgm_ops);

create index if not exists members_alt_phone_trgm_idx
  on public.members using gin (lower(coalesce(alternate_phone,'')) gin_trgm_ops);

create index if not exists members_primary_phone_normalized_idx
  on public.members(primary_phone_normalized);

create index if not exists members_alternate_phone_normalized_idx
  on public.members(alternate_phone_normalized);

create index if not exists areas_name_trgm_idx
  on public.areas using gin (lower(name) gin_trgm_ops);

create index if not exists member_roles_name_trgm_idx
  on public.member_roles using gin (lower(name) gin_trgm_ops);

create or replace function public.search_members(
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
      m.member_role_id,
      mr.name as member_role_name,
      m.status,
      m.created_at,
      m.updated_at
    from public.members m
    join public.areas a on a.id = m.area_id
    join public.member_roles mr on mr.id = m.member_role_id
    where
      (
        p_search is null
        or length(btrim(p_search)) = 0
        or lower(m.full_name) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(m.primary_phone, '')) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(m.alternate_phone, '')) like '%' || lower(btrim(p_search)) || '%'
        or lower(coalesce(a.name, '')) like '%' || lower(btrim(p_search)) || '%'
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

create or replace function public.get_member_dashboard_stats()
returns table (
  total_members bigint,
  incomplete_members bigint,
  by_area jsonb,
  by_role jsonb,
  recent_members jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with visible_members as (
    select
      m.id,
      m.full_name,
      m.status,
      m.primary_phone,
      m.address_details,
      m.area_id,
      m.member_role_id,
      m.created_at,
      a.name as area_name,
      mr.name as member_role_name
    from public.members m
    join public.areas a on a.id = m.area_id
    join public.member_roles mr on mr.id = m.member_role_id
  ),
  area_counts as (
    select area_id, area_name, count(*)::bigint as member_count
    from visible_members
    group by area_id, area_name
    order by member_count desc, area_name
    limit 12
  ),
  role_counts as (
    select member_role_id, member_role_name, count(*)::bigint as member_count
    from visible_members
    group by member_role_id, member_role_name
    order by member_count desc, member_role_name
  ),
  recent as (
    select id, full_name, status, area_name, member_role_name, created_at
    from visible_members
    order by created_at desc, id
    limit 8
  )
  select
    (select count(*)::bigint from visible_members),
    (select count(*)::bigint from visible_members where primary_phone is null or btrim(primary_phone) = '' or address_details is null or btrim(address_details) = ''),
    coalesce((select jsonb_agg(to_jsonb(area_counts)) from area_counts), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(role_counts)) from role_counts), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(recent)) from recent), '[]'::jsonb);
$$;

grant execute on function public.get_member_dashboard_stats() to authenticated;
revoke execute on function public.get_member_dashboard_stats() from anon;

comment on column public.members.primary_phone_normalized is 'Digit-only helper used for duplicate detection/search; original primary_phone input is preserved.';
comment on column public.members.alternate_phone_normalized is 'Digit-only helper used for duplicate detection/search; original alternate_phone input is preserved.';
