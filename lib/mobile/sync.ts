import { createClient } from "@/lib/supabase/client";
import {
  emptyMobileState,
  MobileMember,
  MobileState,
  readMobileState,
  writeMobileState,
} from "@/lib/mobile/storage";

const PAGE_SIZE = 100;

type SearchRow = {
  id: string;
  full_name: string;
  primary_phone: string | null;
  alternate_phone: string | null;
  address_details: string | null;
  area_id: string;
  area_name: string;
  area_level: string;
  member_role_id: string;
  member_role_name: string;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
  total_count: number;
};

function mergeLocalChanges(serverMembers: MobileMember[], localState: MobileState) {
  const byId = new Map(serverMembers.map((member) => [member.id, member]));
  for (const change of localState.pending) {
    if (change.op === "create") {
      const existing = byId.get(change.member_id);
      if (!existing) {
        byId.set(change.member_id, change.payload as MobileMember);
      }
      continue;
    }

    const current = byId.get(change.member_id);
    if (!current) continue;
    byId.set(change.member_id, { ...current, ...change.payload } as MobileMember);
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function fetchServerSnapshot(userId: string, email: string | null) {
  const supabase = createClient();

  const [{ data: areas, error: areasError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("areas").select("id,parent_id,name,level,is_active").order("name"),
    supabase.from("member_roles").select("id,name,description,is_active").order("name"),
  ]);

  if (areasError) throw new Error("Areas could not be synced.");
  if (rolesError) throw new Error("Member roles could not be synced.");

  const members: MobileMember[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (members.length < total) {
    const { data, error } = await supabase.rpc("search_members", {
      p_search: "",
      p_area_id: null,
      p_member_role_id: null,
      p_status: null,
      p_level: null,
      p_page: page,
      p_page_size: PAGE_SIZE,
    });

    if (error) throw new Error("Members could not be synced.");
    const rows = (data ?? []) as SearchRow[];
    if (rows.length === 0) break;

    total = Number(rows[0]?.total_count ?? rows.length);
    members.push(
      ...rows.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        primary_phone: row.primary_phone,
        alternate_phone: row.alternate_phone,
        address_details: row.address_details,
        area_id: row.area_id,
        area_name: row.area_name,
        area_level: row.area_level,
        member_role_id: row.member_role_id,
        member_role_name: row.member_role_name,
        status: row.status,
        created_by: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );

    if (rows.length < PAGE_SIZE) break;
    page += 1;
  }

  return {
    user_id: userId,
    email,
    members,
    areas: areas ?? [],
    roles: roles ?? [],
  };
}

export async function syncMobileState() {
  if (!navigator.onLine) {
    return { state: await readMobileState(), pushed: 0, conflicts: 0, offline: true };
  }

  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    return { state: await readMobileState(), pushed: 0, conflicts: 0, offline: false, authenticated: false };
  }

  let currentState = await readMobileState();

  if (currentState.user_id && currentState.user_id !== user.id) {
    currentState = await emptyMobileState();
  }

  const snapshot = await fetchServerSnapshot(user.id, user.email ?? null);
  currentState = {
    ...currentState,
    ...snapshot,
    members: mergeLocalChanges(snapshot.members, currentState),
    last_sync_at: new Date().toISOString(),
  };

  await writeMobileState(currentState);

  let pushed = 0;
  let conflicts = 0;
  const queue = [...currentState.pending];

  for (const change of queue) {
    try {
      if (change.op === "create") {
        const local = currentState.members.find((item) => item.id === change.member_id);
        if (!local) {
          currentState.pending = currentState.pending.filter((item) => item.id !== change.id);
          continue;
        }

        const { data, error } = await supabase
          .from("members")
          .insert({
            id: local.id,
            full_name: local.full_name,
            primary_phone: local.primary_phone,
            alternate_phone: local.alternate_phone,
            address_details: local.address_details,
            area_id: local.area_id,
            member_role_id: local.member_role_id,
            status: local.status,
            created_by: user.id,
          })
          .select("id,full_name,primary_phone,alternate_phone,address_details,area_id,member_role_id,status,created_at,updated_at")
          .single();

        if (error) throw new Error(error.code === "23505" ? "A matching record already exists on the server." : "Create failed.");
        const area = currentState.areas.find((item) => item.id === data.area_id);
        const role = currentState.roles.find((item) => item.id === data.member_role_id);

        currentState.members = currentState.members.map((item) =>
          item.id === data.id
            ? {
                ...item,
                ...data,
                created_by: data.created_by ?? user.id,
                area_name: area?.name ?? item.area_name,
                area_level: area?.level ?? item.area_level,
                member_role_name: role?.name ?? item.member_role_name,
              }
            : item,
        );
      } else {
        if (!change.base_updated_at) throw new Error("Missing base version for update.");

        const { data, error } = await supabase
          .from("members")
          .update(change.payload)
          .eq("id", change.member_id)
          .eq("updated_at", change.base_updated_at)
          .select("id,full_name,primary_phone,alternate_phone,address_details,area_id,member_role_id,status,created_at,updated_at")
          .maybeSingle();

        if (error) throw new Error("Update failed.");
        if (!data) {
          currentState.pending = currentState.pending.map((item) =>
            item.id === change.id
              ? { ...item, status: "conflict", error_message: "The server record changed while this device was offline." }
              : item,
          );
          conflicts += 1;
          continue;
        }

        const area = currentState.areas.find((item) => item.id === data.area_id);
        const role = currentState.roles.find((item) => item.id === data.member_role_id);

        currentState.members = currentState.members.map((item) =>
          item.id === data.id
            ? {
                ...item,
                ...data,
                area_name: area?.name ?? item.area_name,
                area_level: area?.level ?? item.area_level,
                member_role_name: role?.name ?? item.member_role_name,
              }
            : item,
        );
      }

      currentState.pending = currentState.pending.filter((item) => item.id !== change.id);
      pushed += 1;
      await writeMobileState(currentState);
    } catch (error) {
      currentState.pending = currentState.pending.map((item) =>
        item.id === change.id
          ? {
              ...item,
              status: "error",
              error_message: error instanceof Error ? error.message : "Sync failed.",
            }
          : item,
      );
      await writeMobileState(currentState);
    }
  }

  if (pushed > 0) {
    const fresh = await fetchServerSnapshot(user.id, user.email ?? null);
    currentState = {
      ...currentState,
      ...fresh,
      members: mergeLocalChanges(fresh.members, currentState),
      last_sync_at: new Date().toISOString(),
    };
    await writeMobileState(currentState);
  }

  return { state: currentState, pushed, conflicts, offline: false, authenticated: true };
}
