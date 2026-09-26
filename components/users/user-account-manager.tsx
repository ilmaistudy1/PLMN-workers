"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignUserArea, removeUserArea, setUserAccountStatus, setUserApplicationRole, setUserPhone } from "@/app/dashboard/users/actions";

type Role = { id: string; code: string; name: string; rank: number; is_active: boolean };
type Area = { id: string; name: string; level: string; is_active: boolean };

export function UserAccountManager({ actorId, isSuperAdmin, profile, roles, areas, assignments, activeRoleId }: { actorId: string; isSuperAdmin: boolean; profile: { id: string; email: string | null; full_name: string | null; account_status: "active" | "disabled"; created_at: string; updated_at: string }; roles: Role[]; areas: Area[]; assignments: string[]; activeRoleId: string | null }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  const manageableRoles = useMemo(() => roles.filter((role) => role.is_active && (isSuperAdmin || role.rank < 80)), [isSuperAdmin, roles]);
  const assignedSet = useMemo(() => new Set(assignments), [assignments]);
  const availableAreas = areas.filter((area) => !assignedSet.has(area.id) && area.is_active);
  const currentAssignmentAreas = areas.filter((area) => assignedSet.has(area.id));

  function act(task: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(""); startTransition(async () => { const result = await task(); setMessage(result.message); if (result.ok) router.refresh(); });
  }

  return <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-950">Application role</h2>
        <p className="mt-1 text-sm text-slate-500">Only roles below your authority can be assigned. Super admin is reserved for the highest authority.</p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" action={(formData) => act(() => setUserApplicationRole(profile.id, String(formData.get("role_id") ?? "")))}>
          <select name="role_id" required defaultValue={activeRoleId ?? ""} className="h-11 flex-1 rounded-lg border border-slate-300 px-3"><option value="">Select role</option>{manageableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
          <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Set role"}</button>
        </form>
      </div>
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-950">Area assignments</h2>
        <p className="mt-1 text-sm text-slate-500">Assignments can only be added inside your own authorized area scope.</p>
        <div className="mt-4 space-y-2">{currentAssignmentAreas.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No assigned areas.</p> : currentAssignmentAreas.map((area) => <div key={area.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3"><div><p className="font-medium text-slate-900">{area.name}</p><p className="text-xs text-slate-500">{area.level}{area.is_active ? "" : " · inactive"}</p></div><button type="button" disabled={pending} onClick={() => { if (window.confirm("Remove this area assignment?")) act(() => removeUserArea(profile.id, area.id)); }} className="rounded-lg bg-white px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 disabled:opacity-50">Remove</button></div>)}</div>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" action={(formData) => act(() => assignUserArea(profile.id, String(formData.get("area_id") ?? "")))}>
          <select name="area_id" required className="h-11 flex-1 rounded-lg border border-slate-300 px-3"><option value="">Add area assignment</option>{availableAreas.map((area) => <option key={area.id} value={area.id}>{area.level} — {area.name}</option>)}</select>
          <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Assign</button>
        </form>
      </div>
    </div>
    <aside className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-950">Account</h2>
      <form
        className="mt-4 space-y-3"
        action={(formData) =>
          act(() => setUserPhone(profile.id, String(formData.get("phone") ?? "")))
        }
      >
        <label className="block text-sm font-medium text-slate-800">
          Required phone
          <input
            name="phone"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={profile.phone ?? ""}
            placeholder="+923001234567"
            className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </label>
        <button
          disabled={pending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save phone"}
        </button>
      </form>
      <dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt><dd className="mt-1 font-medium capitalize">{profile.account_status}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Created</dt><dd className="mt-1">{new Date(profile.created_at).toLocaleString()}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Updated</dt><dd className="mt-1">{new Date(profile.updated_at).toLocaleString()}</dd></div></dl>
      <div className="mt-6 border-t border-slate-100 pt-6"><p className="text-sm leading-6 text-slate-600">Disabling blocks application access through server authorization and database policy checks. The underlying Supabase Auth account remains intact.</p><button type="button" disabled={pending || actorId === profile.id} onClick={() => { const next = profile.account_status === "active" ? "disabled" : "active"; if (window.confirm(next === "disabled" ? "Disable this application account?" : "Restore this application account?")) act(() => setUserAccountStatus(profile.id, next)); }} className={"mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold " + (profile.account_status === "active" ? "bg-red-600 text-white" : "bg-slate-900 text-white") + " disabled:opacity-50"}>{profile.account_status === "active" ? "Disable application access" : "Restore application access"}</button></div>
      {message && <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
    </aside>
  </div>;
}
