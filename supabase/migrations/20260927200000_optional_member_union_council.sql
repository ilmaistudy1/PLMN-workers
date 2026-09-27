-- Optional Union Council (UC) attached to a member record.
-- UCs are represented by existing areas whose level is "uc"/"union council"/"union_council".

alter table public.members
  add column if not exists uc_id uuid references public.areas(id) on delete restrict;

create index if not exists members_uc_id_idx on public.members(uc_id);

create or replace function private.validate_member_uc()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.uc_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.areas uc
    where uc.id = new.uc_id
      and uc.is_active = true
      and lower(replace(replace(uc.level, '-', '_'), ' ', '_')) in ('uc', 'union_council')
  ) then
    raise exception 'Selected UC is not an active Union Council area.';
  end if;

  if not exists (
    with recursive descendants as (
      select a.id
      from public.areas a
      where a.id = new.area_id
      union all
      select child.id
      from public.areas child
      join descendants parent on child.parent_id = parent.id
      where child.is_active = true
    )
    select 1
    from descendants
    where id = new.uc_id
  ) then
    raise exception 'Selected UC must belong to the selected area hierarchy.';
  end if;

  return new;
end;
$$;

drop trigger if exists members_validate_uc on public.members;
create trigger members_validate_uc
before insert or update of area_id, uc_id on public.members
for each row execute function private.validate_member_uc();

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
            jsonb_build_object('status', new.status, 'member_role_id', new.member_role_id, 'uc_id', new.uc_id));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
    values (auth.uid(), 'member_updated', 'member', new.id, new.area_id,
            jsonb_build_object('status', new.status, 'uc_id', new.uc_id));

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

    if new.uc_id is distinct from old.uc_id then
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
      values (
        auth.uid(), 'uc_changed', 'member', new.id, new.area_id,
        jsonb_build_object('old_uc_id', old.uc_id, 'new_uc_id', new.uc_id)
      );
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, area_id, metadata)
    values (auth.uid(), 'member_deleted', 'member', old.id, old.area_id,
            jsonb_build_object('status', old.status, 'uc_id', old.uc_id));
    return old;
  end if;

  return null;
end;
$$;
