"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMember, updateMember } from "@/app/dashboard/members/actions";

type AreaOption = { id: string; parent_id: string | null; name: string; level: string; is_active: boolean };
type RoleOption = { id: string; name: string; is_active: boolean };

type MemberFormProps = {
  mode: "create" | "edit";
  member?: {
    id: string;
    full_name: string;
    primary_phone: string | null;
    alternate_phone: string | null;
    address_details: string | null;
    area_id: string;
    member_role_id: string;
    status: "active" | "inactive" | "archived";
  };
  areas: AreaOption[];
  roles: RoleOption[];
};

export function MemberForm({ mode, member, areas, roles }: MemberFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<Array<{ id: string; full_name: string; primary_phone: string | null }>>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const activeAreas = areas.filter((area) => area.is_active || area.id === member?.area_id);
  const activeRoles = roles.filter((role) => role.is_active || role.id === member?.member_role_id);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const input = {
        full_name: String(formData.get("full_name") ?? ""),
        primary_phone: String(formData.get("primary_phone") ?? ""),
        alternate_phone: String(formData.get("alternate_phone") ?? ""),
        address_details: String(formData.get("address_details") ?? ""),
        area_id: String(formData.get("area_id") ?? ""),
        member_role_id: String(formData.get("member_role_id") ?? ""),
        status: String(formData.get("status") ?? "active") as "active" | "inactive" | "archived",
      };

      const result =
        mode === "create"
          ? await createMember({ ...input, confirm_duplicate: confirmDuplicate })
          : await updateMember({ ...input, id: member!.id });

      if (!result.ok) {
        if ("type" in result && result.type === "duplicate") {
          setDuplicates(result.duplicates);
        }
        setError(result.message);
        return;
      }

      router.push(mode === "create" ? "/dashboard/members" : "/dashboard/members/" + member!.id);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          Full Name
          <input name="full_name" required minLength={2} defaultValue={member?.full_name ?? ""} autoFocus className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Primary Phone
          <input name="primary_phone" inputMode="tel" defaultValue={member?.primary_phone ?? ""} placeholder="e.g. 03001234567" className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Alternate Phone
          <input name="alternate_phone" inputMode="tel" defaultValue={member?.alternate_phone ?? ""} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Area
          <select name="area_id" required defaultValue={member?.area_id ?? ""} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Select area</option>
            {activeAreas
              .slice()
              .sort((a, b) => (a.level + a.name).localeCompare(b.level + b.name))
              .map((area) => (
                <option key={area.id} value={area.id}>{area.level} — {area.name}</option>
              ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Member Role
          <select name="member_role_id" required defaultValue={member?.member_role_id ?? ""} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Select member role</option>
            {activeRoles
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((role) => (
                <option key={role.id} value={role.id}>{role.name}{role.is_active ? "" : " (inactive)"}</option>
              ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          Address / Details
          <textarea name="address_details" rows={4} defaultValue={member?.address_details ?? ""} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select name="status" defaultValue={member?.status ?? "active"} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Possible duplicate records</p>
          <div className="mt-2 space-y-1">
            {duplicates.map((item) => (
              <p key={item.id}>{item.full_name}{item.primary_phone ? " — " + item.primary_phone : ""}</p>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
            I reviewed these records and want to save this member anyway.
          </label>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button disabled={pending} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving..." : mode === "create" ? "Save Member" : "Save Changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">Cancel</button>
      </div>
    </form>
  );
}
