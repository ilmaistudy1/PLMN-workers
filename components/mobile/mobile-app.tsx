"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MobileMember,
  MobileState,
  clearMobileState,
  normalizePhone,
  PendingChange,
  readMobileState,
  writeMobileState,
} from "@/lib/mobile/storage";
import { syncMobileState } from "@/lib/mobile/sync";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}


type Tab = "members" | "sync";

function areaLabel(state: MobileState, areaId: string) {
  const area = state.areas.find((item) => item.id === areaId);
  return area ? area.name : "Unknown area";
}

function roleLabel(state: MobileState, roleId: string) {
  const role = state.roles.find((item) => item.id === roleId);
  return role ? role.name : "Unknown role";
}

function localDuplicate(state: MobileState, input: {
  name: string;
  phone: string;
  areaId: string;
}) {
  const phone = normalizePhone(input.phone);
  return state.members.find((member) => {
    if (phone) {
      const primary = normalizePhone(member.primary_phone);
      const alternate = normalizePhone(member.alternate_phone);
      if (primary === phone || alternate === phone) return true;
    }
    return member.area_id === input.areaId &&
      member.full_name.trim().toLowerCase() === input.name.trim().toLowerCase();
  });
}

function MemberCard({
  member,
  state,
  onEdit,
}: {
  member: MobileMember;
  state: MobileState;
  onEdit: (member: MobileMember) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEdit(member)}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-950">{member.full_name}</p>
          <p className="mt-1 text-sm text-slate-500">{member.primary_phone || "No phone"}</p>
        </div>
        <span className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold " +
          (member.status === "active" ? "bg-emerald-50 text-emerald-700" :
           member.status === "inactive" ? "bg-amber-50 text-amber-700" :
           "bg-slate-100 text-slate-600")}>
          {member.status}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{areaLabel(state, member.area_id)}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{roleLabel(state, member.member_role_id)}</span>
      </div>
    </button>
  );
}

function SyncBadge({ state, syncing, online }: { state: MobileState; syncing: boolean; online: boolean }) {
  const pending = state.pending.length;
  if (!online) {
    return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Offline</span>;
  }
  if (syncing) {
    return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Syncing…</span>;
  }
  if (state.pending.some((item) => item.status === "conflict")) {
    return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Conflict</span>;
  }
  if (pending) {
    return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{pending} pending</span>;
  }
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Synced</span>;
}

export default function MobileApp() {
  const router = useRouter();
  const [state, setState] = useState<MobileState>({
    user_id: null, email: null, members: [], areas: [], roles: [], pending: [], last_sync_at: null,
  });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("members");
  const online = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [syncing, setSyncing] = useState(true);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MobileMember | null>(null);
  const [installEvent, setInstallEvent] = useState<Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    primary_phone: "",
    alternate_phone: "",
    address_details: "",
    area_id: "",
    member_role_id: "",
    status: "active" as MobileMember["status"],
  });

  const visibleMembers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return state.members;
    return state.members.filter((member) =>
      member.full_name.toLowerCase().includes(trimmed) ||
      (member.primary_phone ?? "").toLowerCase().includes(trimmed) ||
      (member.alternate_phone ?? "").toLowerCase().includes(trimmed) ||
      member.area_name.toLowerCase().includes(trimmed) ||
      member.member_role_name.toLowerCase().includes(trimmed),
    );
  }, [query, state.members]);

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", onInstall as EventListener);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    void (async () => {
      const local = await readMobileState();
      if (local.user_id) setState(local);
      await doSync();
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void doSync();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [doSync]);

  useEffect(() => {
    if (!online) return;
    void doSync();
  }, [doSync, online]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncMobileState();
      setState(result.state);
      if (result.authenticated === false && !result.state.user_id) {
        router.replace("/login?next=%2Fmobile");
        return;
      }
      if (result.offline) {
        setMessage("Offline mode: using the last synced data on this device.");
      } else if (result.conflicts) {
        setMessage("Some offline changes conflict with newer server records. Review the Sync tab.");
      } else {
        setMessage(result.pushed ? result.pushed + " offline change(s) synced." : "");
      }
    } catch {
      const local = await readMobileState();
      setState(local);
      if (local.user_id) {
        setMessage("Could not reach the server. Continuing with offline data.");
      } else {
        setMessage("Initial sync failed. Connect to the internet and try again.");
      }
    } finally {
      setSyncing(false);
    }
  }, [router]);

  async function installApp() {
    if (!installEvent?.prompt) return;
    await installEvent.prompt();
    setInstallEvent(null);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      full_name: "",
      primary_phone: "",
      alternate_phone: "",
      address_details: "",
      area_id: state.areas.find((item) => item.is_active)?.id ?? "",
      member_role_id: state.roles.find((item) => item.is_active)?.id ?? "",
      status: "active",
    });
    setShowForm(true);
  }

  function openEdit(member: MobileMember) {
    setEditing(member);
    setForm({
      full_name: member.full_name,
      primary_phone: member.primary_phone ?? "",
      alternate_phone: member.alternate_phone ?? "",
      address_details: member.address_details ?? "",
      area_id: member.area_id,
      member_role_id: member.member_role_id,
      status: member.status,
    });
    setShowForm(true);
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.full_name.trim() || !form.area_id || !form.member_role_id) {
      setMessage("Name, area and member role are required.");
      return;
    }

    const duplicate = localDuplicate(state, {
      name: form.full_name,
      phone: form.primary_phone,
      areaId: form.area_id,
    });

    if (duplicate && duplicate.id !== editing?.id) {
      const proceed = window.confirm(
        "A similar local record already exists: " + duplicate.full_name + ". Save anyway?",
      );
      if (!proceed) return;
    }

    const now = new Date().toISOString();
    const area = state.areas.find((item) => item.id === form.area_id);
    const role = state.roles.find((item) => item.id === form.member_role_id);

    if (!editing) {
      const id = crypto.randomUUID();
      const member: MobileMember = {
        id,
        full_name: form.full_name.trim(),
        primary_phone: form.primary_phone.trim() || null,
        alternate_phone: form.alternate_phone.trim() || null,
        address_details: form.address_details.trim() || null,
        area_id: form.area_id,
        area_name: area?.name ?? "",
        area_level: area?.level ?? "",
        member_role_id: form.member_role_id,
        member_role_name: role?.name ?? "",
        status: form.status,
        created_by: state.user_id,
        created_at: now,
        updated_at: now,
      };

      const next: MobileState = {
        ...state,
        members: [member, ...state.members],
        pending: [
          ...state.pending,
          {
            id: crypto.randomUUID(),
            op: "create",
            member_id: id,
            payload: member,
            base_updated_at: null,
            created_at: now,
            status: "pending",
            error_message: null,
          },
        ],
      };
      await writeMobileState(next);
      setState(next);
      setShowForm(false);
      setMessage(online ? "Saved locally. Syncing…" : "Saved offline. It will sync when internet returns.");
      if (online) void doSync();
      return;
    }

    const updated: MobileMember = {
      ...editing,
      full_name: form.full_name.trim(),
      primary_phone: form.primary_phone.trim() || null,
      alternate_phone: form.alternate_phone.trim() || null,
      address_details: form.address_details.trim() || null,
      area_id: form.area_id,
      area_name: area?.name ?? "",
      area_level: area?.level ?? "",
      member_role_id: form.member_role_id,
      member_role_name: role?.name ?? "",
      status: form.status,
      updated_at: now,
    };

    const existingCreate = state.pending.find(
      (item) => item.member_id === updated.id && item.op === "create",
    );

    const nextPending: PendingChange[] = existingCreate
      ? state.pending.map((item) =>
          item.id === existingCreate.id
            ? {
                ...item,
                payload: updated,
                status: "pending" as const,
                error_message: null,
              }
            : item,
        )
      : [
          ...state.pending.filter((item) => item.member_id !== updated.id),
          {
            id: crypto.randomUUID(),
            op: "update",
            member_id: updated.id,
            payload: {
              full_name: updated.full_name,
              primary_phone: updated.primary_phone,
              alternate_phone: updated.alternate_phone,
              address_details: updated.address_details,
              area_id: updated.area_id,
              member_role_id: updated.member_role_id,
              status: updated.status,
            },
            base_updated_at: editing.updated_at,
            created_at: now,
            status: "pending",
            error_message: null,
          },
        ];

    const next: MobileState = {
      ...state,
      members: state.members.map((member) => member.id === updated.id ? updated : member),
      pending: nextPending,
    };
    await writeMobileState(next);
    setState(next);
    setShowForm(false);
    setMessage(online ? "Updated locally. Syncing…" : "Updated offline. It will sync when internet returns.");
    if (online) void doSync();
  }

  async function archiveMember() {
    if (!editing) return;
    if (!window.confirm("Archive this member?")) return;
    setForm((value) => ({ ...value, status: "archived" }));
    const now = new Date().toISOString();
    const nextMember = { ...editing, status: "archived" as const, updated_at: now };
    const existingCreate = state.pending.find(
      (item) => item.member_id === editing.id && item.op === "create",
    );

    const next: MobileState = {
      ...state,
      members: state.members.map((member) => member.id === editing.id ? nextMember : member),
      pending: existingCreate
        ? state.pending.map((item) =>
            item.id === existingCreate.id
              ? {
                  ...item,
                  payload: nextMember,
                  status: "pending" as const,
                  error_message: null,
                }
              : item,
          )
        : [
            ...state.pending.filter((item) => item.member_id !== editing.id),
            {
              id: crypto.randomUUID(),
              op: "update",
              member_id: editing.id,
              payload: { status: "archived" },
              base_updated_at: editing.updated_at,
              created_at: now,
              status: "pending",
              error_message: null,
            },
          ],
    };
    await writeMobileState(next);
    setState(next);
    setShowForm(false);
    setMessage(online ? "Archived locally. Syncing…" : "Archived offline.");
    if (online) void doSync();
  }

  async function resolveConflict(change: PendingChange, useLocal: boolean) {
    if (!change.error_message || change.status !== "conflict") return;
    const member = state.members.find((item) => item.id === change.member_id);
    if (!member) return;

    if (!useLocal) {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id,full_name,primary_phone,alternate_phone,address_details,area_id,member_role_id,status,created_at,updated_at")
        .eq("id", change.member_id)
        .maybeSingle();

      if (error || !data) {
        setMessage("The server version could not be loaded.");
        return;
      }

      const area = state.areas.find((item) => item.id === data.area_id);
      const role = state.roles.find((item) => item.id === data.member_role_id);
      const serverMember: MobileMember = {
        ...member,
        ...data,
        area_name: area?.name ?? member.area_name,
        area_level: area?.level ?? member.area_level,
        member_role_name: role?.name ?? member.member_role_name,
        created_by: member.created_by,
      };

      const next = {
        ...state,
        members: state.members.map((item) => item.id === member.id ? serverMember : item),
        pending: state.pending.filter((item) => item.id !== change.id),
      };
      await writeMobileState(next);
      setState(next);
      setMessage("Server version restored.");
      return;
    }

    if (!navigator.onLine) {
      setMessage("Connect to the internet before overwriting the server record.");
      return;
    }

    const confirmed = window.confirm(
      "Overwrite the current server record with your offline version? This keeps your local changes.",
    );
    if (!confirmed) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("members")
      .update(change.payload)
      .eq("id", change.member_id)
      .select("id,full_name,primary_phone,alternate_phone,address_details,area_id,member_role_id,status,created_at,updated_at")
      .maybeSingle();

    if (error || !data) {
      setMessage("The server could not be overwritten. Refresh and try again.");
      return;
    }

    const area = state.areas.find((item) => item.id === data.area_id);
    const role = state.roles.find((item) => item.id === data.member_role_id);
    const resolved: MobileMember = {
      ...member,
      ...data,
      area_name: area?.name ?? member.area_name,
      area_level: area?.level ?? member.area_level,
      member_role_name: role?.name ?? member.member_role_name,
      created_by: member.created_by,
    };

    const next = {
      ...state,
      members: state.members.map((item) => item.id === member.id ? resolved : item),
      pending: state.pending.filter((item) => item.id !== change.id),
    };
    await writeMobileState(next);
    setState(next);
    setMessage("Your offline version replaced the server version.");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    await clearMobileState();
    router.replace("/login");
  }

  const conflictCount = state.pending.filter((item) => item.status === "conflict").length;
  const errorCount = state.pending.filter((item) => item.status === "error").length;

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">PLMN Workers</p>
            <h1 className="text-lg font-bold text-slate-950">Mobile</h1>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge state={state} syncing={syncing} online={online} />
            {installEvent?.prompt && (
              <button onClick={installApp} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                Install
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {message && (
          <div className="mb-4 rounded-xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200">
            {message}
          </div>
        )}

        {tab === "members" ? (
          <section className="space-y-4">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, area or role…"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
                />
                <button
                  onClick={openCreate}
                  className="h-11 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                >
                  Add
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{visibleMembers.length.toLocaleString()} visible</span>
                <span>{state.members.length.toLocaleString()} cached</span>
              </div>
            </div>

            {visibleMembers.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
                <p className="font-semibold text-slate-900">No members found</p>
                <p className="mt-1 text-sm text-slate-500">Try another search or add a member.</p>
              </div>
            ) : (
              visibleMembers.map((member) => (
                <MemberCard key={member.id} member={member} state={state} onEdit={openEdit} />
              ))
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Sync center</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Last sync: {state.last_sync_at ? new Date(state.last_sync_at).toLocaleString() : "Never"}
                  </p>
                </div>
                <button
                  onClick={() => void doSync()}
                  disabled={syncing || !online}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-400">Cached members</p><p className="mt-1 text-2xl font-bold">{state.members.length.toLocaleString()}</p></div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-400">Pending changes</p><p className="mt-1 text-2xl font-bold">{state.pending.length.toLocaleString()}</p></div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-400">Conflicts / errors</p><p className="mt-1 text-2xl font-bold">{(conflictCount + errorCount).toLocaleString()}</p></div>
            </div>

            {state.pending.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
                <p className="font-semibold text-emerald-700">Everything is synced.</p>
                <p className="mt-1 text-sm text-slate-500">The app is ready to work offline.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {state.pending.map((item) => {
                  const member = state.members.find((row) => row.id === item.member_id);
                  return (
                    <div key={item.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{member?.full_name ?? item.member_id}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.op === "create" ? "New member" : "Member update"} · {item.status}</p>
                        </div>
                        {item.error_message && <span className="max-w-[55%] text-right text-xs text-red-600">{item.error_message}</span>}
                      </div>
                      {item.status === "conflict" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void resolveConflict(item, false)}
                            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Use server version
                          </button>
                          <button
                            type="button"
                            onClick={() => void resolveConflict(item, true)}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                          >
                            Keep my version
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-around">
          <button
            onClick={() => setTab("members")}
            className={"rounded-xl px-5 py-2 text-sm font-semibold " + (tab === "members" ? "bg-slate-900 text-white" : "text-slate-600")}
          >
            Members
          </button>
          <button
            onClick={() => setTab("sync")}
            className={"rounded-xl px-5 py-2 text-sm font-semibold " + (tab === "sync" ? "bg-slate-900 text-white" : "text-slate-600")}
          >
            Sync {state.pending.length ? "(" + state.pending.length + ")" : ""}
          </button>
          <button onClick={() => void signOut()} className="rounded-xl px-5 py-2 text-sm font-semibold text-slate-600">
            Sign out
          </button>
        </div>
      </nav>

      {showForm && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/45 p-4">
          <div className="mx-auto mt-10 max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Offline-capable form</p>
                <h2 className="mt-1 text-xl font-bold">{editing ? "Edit member" : "Add member"}</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-sm text-slate-500">Close</button>
            </div>

            <form onSubmit={saveMember} className="mt-5 space-y-4">
              <input
                required
                value={form.full_name}
                onChange={(event) => setForm((value) => ({ ...value, full_name: event.target.value }))}
                placeholder="Full name"
                className="h-11 w-full rounded-xl border border-slate-300 px-3"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={form.primary_phone}
                  onChange={(event) => setForm((value) => ({ ...value, primary_phone: event.target.value }))}
                  placeholder="Primary phone"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3"
                />
                <input
                  value={form.alternate_phone}
                  onChange={(event) => setForm((value) => ({ ...value, alternate_phone: event.target.value }))}
                  placeholder="Alternate phone"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3"
                />
              </div>
              <select
                required
                value={form.area_id}
                onChange={(event) => setForm((value) => ({ ...value, area_id: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-3"
              >
                <option value="">Select area</option>
                {state.areas.filter((item) => item.is_active).map((area) => (
                  <option key={area.id} value={area.id}>{area.name} · {area.level}</option>
                ))}
              </select>
              <select
                required
                value={form.member_role_id}
                onChange={(event) => setForm((value) => ({ ...value, member_role_id: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-3"
              >
                <option value="">Select member role</option>
                {state.roles.filter((item) => item.is_active).map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <select
                value={form.status}
                onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as MobileMember["status"] }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-3"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
              <textarea
                value={form.address_details}
                onChange={(event) => setForm((value) => ({ ...value, address_details: event.target.value }))}
                placeholder="Address / details"
                rows={3}
                className="w-full rounded-xl border border-slate-300 px-3 py-3"
              />

              <div className="flex flex-wrap gap-2 pt-2">
                <button type="submit" className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
                  {online ? "Save & sync" : "Save offline"}
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => void archiveMember()}
                    className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700"
                  >
                    Archive
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
