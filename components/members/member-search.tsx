"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Area = { id: string; parent_id: string | null; name: string; level: string; is_active: boolean };
type Role = { id: string; name: string; is_active: boolean };
type Row = {
  id: string;
  full_name: string;
  primary_phone: string | null;
  area_name: string;
  area_level: string;
  member_role_name: string;
  status: string;
};

function descendants(areas: Area[], rootId: string) {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const area of areas) {
      if (area.parent_id && result.has(area.parent_id) && !result.has(area.id)) {
        result.add(area.id);
        changed = true;
      }
    }
  }
  return result;
}

function isUnder(areas: Area[], areaId: string, rootId: string) {
  return descendants(areas, rootId).has(areaId);
}

function levelMatch(area: Area, levels: string[]) {
  return levels.includes(area.level.toLowerCase());
}

function prettyLevel(level: string) {
  return level.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MemberSearch({
  areas,
  roles,
  initialRows,
  initialTotal,
}: {
  areas: Area[];
  roles: Role[];
  initialRows: Row[];
  initialTotal: number;
}) {
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [localArea, setLocalArea] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 25;

  const provinceOptions = useMemo(
    () => areas.filter((area) => levelMatch(area, ["province", "region"]) && area.is_active),
    [areas],
  );

  const districtOptions = useMemo(
    () => areas.filter((area) => {
      if (!levelMatch(area, ["district"]) || !area.is_active) return false;
      return !province || isUnder(areas, area.id, province);
    }),
    [areas, province],
  );

  const tehsilOptions = useMemo(
    () => areas.filter((area) => {
      if (!levelMatch(area, ["tehsil"]) || !area.is_active) return false;
      const root = district || province;
      return !root || isUnder(areas, area.id, root);
    }),
    [areas, district, province],
  );

  const localOptions = useMemo(
    () => areas.filter((area) => {
      if (!levelMatch(area, ["local area", "local_area", "area"]) || !area.is_active) return false;
      const root = tehsil || district || province;
      return !root || isUnder(areas, area.id, root);
    }),
    [areas, tehsil, district, province],
  );

  const selectedArea = localArea || tehsil || district || province;

  async function runSearch(nextPage: number) {
    setLoading(true);
    try {
      const response = await fetch("/api/members/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search,
          area_id: selectedArea || null,
          member_role_id: role || null,
          status: status || null,
          page: nextPage,
          page_size: pageSize,
        }),
      });

      const payload = (await response.json()) as {
        rows?: Row[];
        total?: number;
        message?: string;
      };

      if (response.ok) {
        setRows(payload.rows ?? []);
        setTotal(Number(payload.total ?? 0));
        setPage(nextPage);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, selectedArea, role, status]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <label className="sr-only" htmlFor="member-search">Search members</label>
        <input
          id="member-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, phone, area or member role..."
          className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-900"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <select value={province} onChange={(e) => { setProvince(e.target.value); setDistrict(""); setTehsil(""); setLocalArea(""); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">Province / Region</option>
            {provinceOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <select value={district} onChange={(e) => { setDistrict(e.target.value); setTehsil(""); setLocalArea(""); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">District</option>
            {districtOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <select value={tehsil} onChange={(e) => { setTehsil(e.target.value); setLocalArea(""); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">Tehsil</option>
            {tehsilOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <select value={localArea} onChange={(e) => setLocalArea(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">Local Area</option>
            {localOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">Member role</option>
            {roles.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{total.toLocaleString()} matching members</p>
        <Link href="/dashboard/members/new" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add Member</Link>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-900">No members found</p>
            <p className="mt-1 text-sm text-slate-500">Try a different search or filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={"/dashboard/members/" + row.id} className="font-semibold text-slate-900 hover:underline">{row.full_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.primary_phone || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.area_name}</span>
                      <span className="ml-2 text-xs text-slate-400">{prettyLevel(row.area_level)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.member_role_name}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{row.status}</td>
                    <td className="px-4 py-3 text-right">
                      <Link className="font-medium text-slate-700 hover:underline" href={"/dashboard/members/" + row.id}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <button disabled={page === 1 || loading} onClick={() => void runSearch(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200 disabled:opacity-40">Previous</button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages || loading} onClick={() => void runSearch(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200 disabled:opacity-40">Next</button>
        </div>
      )}
    </section>
  );
}
