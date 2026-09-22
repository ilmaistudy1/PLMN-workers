"use client";

import { useMemo, useState, useTransition } from "react";
import { createArea, setAreaActive, updateArea } from "@/app/dashboard/areas/actions";

type Area = { id: string; parent_id: string | null; name: string; level: string; is_active: boolean };

function Tree({ areas, parentId, level, onEdit }: { areas: Area[]; parentId: string | null; level: number; onEdit: (area: Area) => void }) {
  const children = areas.filter((area) => area.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
  if (!children.length) return null;
  return (
    <div className={level ? "ml-5 border-l border-slate-200 pl-4" : ""}>
      <div className="space-y-2">
        {children.map((area) => (
          <div key={area.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <p className="font-medium text-slate-900">{area.name}</p>
                <p className="text-xs text-slate-500">{area.level}{area.is_active ? "" : " · inactive"}</p>
              </div>
              <button onClick={() => onEdit(area)} className="rounded-md bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-slate-200">Edit</button>
            </div>
            <Tree areas={areas} parentId={area.id} level={level + 1} onEdit={onEdit} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AreaManager({ initialAreas }: { initialAreas: Area[] }) {
  const [areas] = useState(initialAreas);
  const [editing, setEditing] = useState<Area | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const activeAreas = useMemo(() => areas.filter((area) => area.is_active), [areas]);

  function create(form: FormData) {
    setMessage("");
    startTransition(async () => {
      const result = await createArea({
        name: String(form.get("name") ?? ""),
        level: String(form.get("level") ?? ""),
        parent_id: String(form.get("parent_id") ?? "") || null,
      });
      setMessage(result.message);
      if (result.ok) window.location.reload();
    });
  }

  function saveEdit(form: FormData) {
    if (!editing) return;
    setMessage("");
    startTransition(async () => {
      const result = await updateArea({
        id: editing.id,
        name: String(form.get("name") ?? ""),
        level: String(form.get("level") ?? ""),
        parent_id: String(form.get("parent_id") ?? "") || null,
      });
      setMessage(result.message);
      if (result.ok) window.location.reload();
    });
  }

  function toggle(area: Area) {
    if (!window.confirm(area.is_active ? "Deactivate this area?" : "Activate this area?")) return;
    startTransition(async () => {
      const result = await setAreaActive(area.id, !area.is_active);
      setMessage(result.message);
      if (result.ok) window.location.reload();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-950">{editing ? "Edit area" : "Create area"}</h2>
          <form action={editing ? saveEdit : create} className="mt-4 space-y-3">
            <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Area name" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            <input name="level" required defaultValue={editing?.level ?? ""} placeholder="Level e.g. province, district, tehsil" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            <select name="parent_id" defaultValue={editing?.parent_id ?? ""} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="">No parent / root</option>
              {activeAreas.filter((area) => area.id !== editing?.id).map((area) => (
                <option key={area.id} value={area.id}>{area.level} — {area.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : editing ? "Save changes" : "Create area"}</button>
              {editing && <button type="button" onClick={() => setEditing(null)} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200">Cancel</button>}
            </div>
          </form>
          {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="mb-5">
          <h2 className="font-semibold text-slate-950">Area hierarchy</h2>
          <p className="mt-1 text-sm text-slate-500">Navigate from parent areas to child areas. Levels are stored as data.</p>
        </div>
        <Tree areas={areas} parentId={null} level={0} onEdit={setEditing} />
        {areas.length === 0 && <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No areas yet. Create the root organization/location first.</div>}
        {editing && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-sm font-medium text-slate-700">Area status</p>
            <button disabled={pending} onClick={() => toggle(editing)} className="mt-2 rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200 disabled:opacity-50">
              {editing.is_active ? "Deactivate area" : "Activate area"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
