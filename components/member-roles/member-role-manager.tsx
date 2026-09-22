"use client";

import { useState, useTransition } from "react";
import { createMemberRole, updateMemberRole } from "@/app/dashboard/member-roles/actions";

type Role = { id: string; name: string; description: string | null; is_active: boolean };

export function MemberRoleManager({ initialRoles }: { initialRoles: Role[] }) {
  const [editing, setEditing] = useState<Role | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function create(form: FormData) {
    setMessage("");
    startTransition(async () => {
      const result = await createMemberRole({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
      });
      setMessage(result.message);
      if (result.ok) window.location.reload();
    });
  }

  function update(form: FormData) {
    if (!editing) return;
    startTransition(async () => {
      const result = await updateMemberRole({
        id: editing.id,
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        is_active: form.get("is_active") === "on",
      });
      setMessage(result.message);
      if (result.ok) window.location.reload();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-950">{editing ? "Edit member role" : "Create member role"}</h2>
        <form action={editing ? update : create} className="mt-4 space-y-3">
          <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Role name" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          <textarea name="description" rows={4} defaultValue={editing?.description ?? ""} placeholder="Optional description" className="w-full rounded-lg border border-slate-300 p-3 text-sm" />
          {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={editing.is_active} /> Active</label>}
          <div className="flex gap-2">
            <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : editing ? "Save changes" : "Create role"}</button>
            {editing && <button type="button" onClick={() => setEditing(null)} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200">Cancel</button>}
          </div>
        </form>
        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Member classifications</h2>
        </div>
        {initialRoles.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No member roles created yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {initialRoles.map((role) => (
              <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-slate-900">{role.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{role.description || "No description"} · {role.is_active ? "Active" : "Inactive"}</p>
                </div>
                <button onClick={() => setEditing(role)} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">Edit</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
