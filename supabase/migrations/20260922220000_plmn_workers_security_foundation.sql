-- PLMN Workers: database, roles, hierarchy, RLS, authorization, and audit
-- 20260922220000_plmn_workers_security_foundation

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  account_status text not null default 'active'
    check (account_status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  rank smallint not null check (rank > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.areas(id) on delete restrict,
  name text not null,
  level text not null default 'area',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_no_empty_name check (length(btrim(name)) > 0)
);

create table public.user_area_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, area_id)
);

create table public.member_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_roles_no_empty_name check (length(btrim(name)) > 0)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  primary_phone text,
  alternate_phone text,
  address_details text,
  area_id uuid not null references public.areas(id) on delete restrict,
  member_role_id uuid not null references public.member_roles(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_no_empty_name check (length(btrim(full_name)) > 0)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  area_id uuid references public.areas(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index user_roles_role_id_idx on public.user_roles(role_id);
create index user_area_assignments_area_id_idx on public.user_area_assignments(area_id);
create index areas_parent_id_idx on public.areas(parent_id);
create index areas_active_idx on public.areas(is_active);
create index members_area_id_idx on public.members(area_id);
create index members_member_role_id_idx on public.members(member_role_id);
create index members_status_idx on public.members(status);
create index members_full_name_lower_idx on public.members(lower(full_name));
create index members_primary_phone_idx on public.members(primary_phone);
create index audit_logs_area_id_created_at_idx on public.audit_logs(area_id, created_at desc);
create index audit_logs_actor_created_at_idx on public.audit_logs(actor_user_id, created_at desc);

insert into public.roles (code, name, description, rank)
values
  ('super_admin', 'Super Admin', 'Full application administration.', 100),
  ('admin', 'Admin', 'Manage assigned organizational scope and subordinate accounts.', 80),
  ('area_manager', 'Area Manager', 'Manage members within assigned areas.', 60),
  ('data_entry', 'Data Entry', 'Add and update members within assigned areas.', 40),
  ('viewer', 'Viewer', 'Read-only access within assigned areas.', 20)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    rank = excluded.rank,
    updated_at = now();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_plmn on auth.users;
create trigger on_auth_user_created_plmn
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email, updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated_plmn on auth.users;
create trigger on_auth_user_email_updated_plmn
after update of email on auth.users
for each row execute function private.sync_auth_user_email();

create or replace function private.user_has_role(p_user_id uuid, p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.code = p_role_code
      and r.is_active = true
  );
$$;

create or replace function private.user_has_any_role(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.is_active = true
  );
$$;

create or replace function private.user_highest_role_rank(p_user_id uuid)
returns smallint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(max(r.rank), 0)::smallint
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id
    and r.is_active = true;
$$;

create or replace function private.is_super_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.user_has_role(p_user_id, 'super_admin');
$$;

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.user_has_role(p_user_id, 'admin');
$$;

create or replace function private.can_manage_user(p_actor_id uuid, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_actor_id <> p_target_id
    and (
      private.is_super_admin(p_actor_id)
      or (
        private.is_admin(p_actor_id)
        and private.user_highest_role_rank(p_actor_id) > private.user_highest_role_rank(p_target_id)
      )
    );
$$;

create or replace function private.role_is_assignable(p_actor_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.roles r
    where r.id = p_role_id
      and r.is_active = true
      and (
        private.is_super_admin(p_actor_id)
        or r.rank < private.user_highest_role_rank(p_actor_id)
      )
  );
$$;

create or replace function private.area_is_active(p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.areas
    where id = p_area_id and is_active = true
  );
$$;

create or replace function private.user_can_access_area(p_user_id uuid, p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive scoped_areas as (
    select uaa.area_id
    from public.user_area_assignments uaa
    where uaa.user_id = p_user_id

    union

    select a.id
    from public.areas a
    join scoped_areas s on a.parent_id = s.area_id
    where a.is_active = true
  )
  select
    private.is_super_admin(p_user_id)
    or (
      private.user_has_any_role(p_user_id)
      and private.area_is_active(p_area_id)
      and exists (
        select 1
        from scoped_areas s
        where s.area_id = p_area_id
      )
    );
$$;

create or replace function private.user_can_manage_area(p_user_id uuid, p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    private.is_super_admin(p_user_id)
    or (
      private.is_admin(p_user_id)
      and private.user_can_access_area(p_user_id, p_area_id)
    );
$$;

create or replace function private.user_can_manage_area_parent(p_user_id uuid, p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    private.is_super_admin(p_user_id)
    or (
      p_parent_id is not null
      and private.is_admin(p_user_id)
      and private.user_can_access_area(p_user_id, p_parent_id)
    );
$$;

create or replace function private.member_role_is_active(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.member_roles
    where id = p_role_id and is_active = true
  );
$$;

create or replace function private.user_can_manage_members(p_user_id uuid, p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    private.user_has_role(p_user_id, 'super_admin')
    or private.user_has_role(p_user_id, 'admin')
    or private.user_has_role(p_user_id, 'area_manager')
    or private.user_has_role(p_user_id, 'data_entry')
  and private.user_can_access_area(p_user_id, p_area_id);
$$;

create or replace function private.prevent_area_cycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'An area cannot be its own parent';
  end if;

  if exists (
    with recursive ancestors as (
      select new.parent_id as id
      union all
      select a.parent_id
      from public.areas a
      join ancestors x on x.id = a.id
      where a.parent_id is not null
    )
    select 1
    from ancestors
    where id = new.id
  ) then
    raise exception 'Area hierarchy cycle detected';
  end if;

  return new;
end;
$$;

drop trigger if exists areas_prevent_cycle on public.areas;
create trigger areas_prevent_cycle
before insert or update of parent_id on public.areas
for each row execute function private.prevent_area_cycle();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

drop trigger if exists areas_set_updated_at on public.areas;
create trigger areas_set_updated_at
before update on public.areas
for each row execute function private.set_updated_at();

drop trigger if exists member_roles_set_updated_at on public.member_roles;
create trigger member_roles_set_updated_at
before update on public.member_roles
for each row execute function private.set_updated_at();

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row execute function private.set_updated_at();

create or replace function private.guard_member_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

drop trigger if exists members_guard_update on public.members;
create trigger members_guard_update
before update on public.members
for each row execute function private.guard_member_update();

create or replace function private.audit_members()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
    values (auth.uid(), 'member_created', 'member', new.id, new.area_id,
            jsonb_build_object('status', new.status, 'member_role_id', new.member_role_id));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
    values (auth.uid(), 'member_updated', 'member', new.id, new.area_id,
            jsonb_build_object('status', new.status));

    if new.area_id is distinct from old.area_id then
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
      values (
        auth.uid(), 'area_changed', 'member', new.id, new.area_id,
        jsonb_build_object('old_area_id', old.area_id, 'new_area_id', new.area_id)
      );
    end if;

    if new.member_role_id is distinct from old.member_role_id then
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
      values (
        auth.uid(), 'role_changed', 'member', new.id, new.area_id,
        jsonb_build_object('old_member_role_id', old.member_role_id, 'new_member_role_id', new.member_role_id)
      );
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
    values (auth.uid(), 'member_deleted', 'member', old.id, old.area_id,
            jsonb_build_object('status', old.status));
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists audit_members_changes on public.members;
create trigger audit_members_changes
after insert or update or delete on public.members
for each row execute function private.audit_members();

create or replace function private.audit_area_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
  values (
    auth.uid(),
    'area_changed',
    'area',
    coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then null else coalesce(new.id, old.id) end,
    jsonb_build_object(
      'operation', tg_op,
      'parent_id', coalesce(new.parent_id, old.parent_id),
      'is_active', coalesce(new.is_active, old.is_active)
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_area_changes on public.areas;
create trigger audit_area_changes
after insert or update or delete on public.areas
for each row execute function private.audit_area_changes();

create or replace function private.audit_member_role_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'role_changed',
    'member_role',
    coalesce(new.id, old.id),
    jsonb_build_object('operation', tg_op, 'is_active', coalesce(new.is_active, old.is_active))
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_member_role_changes on public.member_roles;
create trigger audit_member_role_changes
after insert or update or delete on public.member_roles
for each row execute function private.audit_member_role_changes();

create or replace function private.audit_user_role_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  affected_user uuid := coalesce(new.user_id, old.user_id);
  affected_role uuid := coalesce(new.role_id, old.role_id);
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'user_role_changed',
    'user',
    affected_user,
    jsonb_build_object('operation', tg_op, 'role_id', affected_role)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_user_role_changes on public.user_roles;
create trigger audit_user_role_changes
after insert or update or delete on public.user_roles
for each row execute function private.audit_user_role_changes();

create or replace function private.audit_user_area_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
  values (
    auth.uid(),
    'area_changed',
    'user_area_assignment',
    coalesce(new.user_id, old.user_id),
    coalesce(new.area_id, old.area_id),
    jsonb_build_object('operation', tg_op, 'area_id', coalesce(new.area_id, old.area_id))
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_user_area_changes on public.user_area_assignments;
create trigger audit_user_area_changes
after insert or update or delete on public.user_area_assignments
for each row execute function private.audit_user_area_changes();

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_area_assignments enable row level security;
alter table public.areas enable row level security;
alter table public.member_roles enable row level security;
alter table public.members enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table
  public.profiles,
  public.roles,
  public.user_roles,
  public.user_area_assignments,
  public.areas,
  public.member_roles,
  public.members,
  public.audit_logs
from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.user_area_assignments to authenticated;
grant select, insert, update, delete on public.areas to authenticated;
grant select, insert, update, delete on public.member_roles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select on public.audit_logs to authenticated;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or private.is_super_admin(auth.uid())
  or private.is_admin(auth.uid())
);

create policy profiles_manage
on public.profiles
for update
to authenticated
using (private.can_manage_user(auth.uid(), id))
with check (private.can_manage_user(auth.uid(), id));

create policy roles_select
on public.roles
for select
to authenticated
using (private.user_has_any_role(auth.uid()));

create policy roles_manage
on public.roles
for all
to authenticated
using (private.is_super_admin(auth.uid()))
with check (private.is_super_admin(auth.uid()));

create policy user_roles_select
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or private.can_manage_user(auth.uid(), user_id)
);

create policy user_roles_insert
on public.user_roles
for insert
to authenticated
with check (
  private.can_manage_user(auth.uid(), user_id)
  and private.role_is_assignable(auth.uid(), role_id)
);

create policy user_roles_update
on public.user_roles
for update
to authenticated
using (
  private.can_manage_user(auth.uid(), user_id)
)
with check (
  private.can_manage_user(auth.uid(), user_id)
  and private.role_is_assignable(auth.uid(), role_id)
);

create policy user_roles_delete
on public.user_roles
for delete
to authenticated
using (
  private.can_manage_user(auth.uid(), user_id)
);

create policy user_area_assignments_select
on public.user_area_assignments
for select
to authenticated
using (
  user_id = auth.uid()
  or private.can_manage_user(auth.uid(), user_id)
);

create policy user_area_assignments_insert
on public.user_area_assignments
for insert
to authenticated
with check (
  private.can_manage_user(auth.uid(), user_id)
  and private.user_can_access_area(auth.uid(), area_id)
  and private.area_is_active(area_id)
);

create policy user_area_assignments_update
on public.user_area_assignments
for update
to authenticated
using (
  private.can_manage_user(auth.uid(), user_id)
)
with check (
  private.can_manage_user(auth.uid(), user_id)
  and private.user_can_access_area(auth.uid(), area_id)
  and private.area_is_active(area_id)
);

create policy user_area_assignments_delete
on public.user_area_assignments
for delete
to authenticated
using (
  private.can_manage_user(auth.uid(), user_id)
);

create policy areas_select
on public.areas
for select
to authenticated
using (
  private.user_has_any_role(auth.uid())
  and private.user_can_access_area(auth.uid(), id)
);

create policy areas_insert
on public.areas
for insert
to authenticated
with check (
  private.is_super_admin(auth.uid())
  or (
    private.is_admin(auth.uid())
    and private.user_can_manage_area_parent(auth.uid(), parent_id)
  )
);

create policy areas_update
on public.areas
for update
to authenticated
using (
  private.user_can_manage_area(auth.uid(), id)
)
with check (
  (
    private.is_super_admin(auth.uid())
    and (parent_id is null or private.area_is_active(parent_id))
  )
  or (
    private.is_admin(auth.uid())
    and private.user_can_manage_area_parent(auth.uid(), parent_id)
  )
);

create policy areas_delete
on public.areas
for delete
to authenticated
using (
  private.is_super_admin(auth.uid())
);

create policy member_roles_select
on public.member_roles
for select
to authenticated
using (private.user_has_any_role(auth.uid()));

create policy member_roles_manage
on public.member_roles
for all
to authenticated
using (
  private.is_super_admin(auth.uid()) or private.is_admin(auth.uid())
)
with check (
  private.is_super_admin(auth.uid()) or private.is_admin(auth.uid())
);

create policy members_select
on public.members
for select
to authenticated
using (
  private.user_has_any_role(auth.uid())
  and private.user_can_access_area(auth.uid(), area_id)
);

create policy members_insert
on public.members
for insert
to authenticated
with check (
  created_by = auth.uid()
  and private.user_can_manage_members(auth.uid(), area_id)
  and private.area_is_active(area_id)
  and private.member_role_is_active(member_role_id)
);

create policy members_update
on public.members
for update
to authenticated
using (
  private.user_can_manage_members(auth.uid(), area_id)
)
with check (
  private.user_can_manage_members(auth.uid(), area_id)
  and private.area_is_active(area_id)
  and private.member_role_is_active(member_role_id)
);

create policy members_delete
on public.members
for delete
to authenticated
using (
  private.is_super_admin(auth.uid())
  or private.is_admin(auth.uid())
    and private.user_can_access_area(auth.uid(), area_id)
);

create policy audit_logs_select
on public.audit_logs
for select
to authenticated
using (
  private.is_super_admin(auth.uid())
  or (
    private.is_admin(auth.uid())
    and area_id is not null
    and private.user_can_access_area(auth.uid(), area_id)
  )
);

revoke all on all functions in schema private from public, anon, authenticated;

comment on table public.profiles is 'Application profile for authenticated users; authorization is stored in roles/user_roles, never editable user_metadata.';
comment on table public.roles is 'Extensible application authorization roles.';
comment on table public.user_roles is 'Separates login-account permissions from member classification.';
comment on table public.areas is 'Flexible self-referencing organizational/location hierarchy.';
comment on table public.members is 'Workers/supporters managed by authorized application users.';
comment on table public.member_roles is 'Member classifications, separate from application login roles.';
comment on table public.audit_logs is 'Security-relevant application audit events without passwords, tokens, or unnecessary private data.';
