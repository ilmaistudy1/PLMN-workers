"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

function Highlight({ value, query }: { value: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{value}</>;
  const parts = value.split(new RegExp("(" + escapeRegExp(trimmed) + ")", "ig"));
  return <>
    {parts.map((part, index) => part.toLowerCase() === trimmed.toLowerCase()
      ? <mark key={index} className="rounded bg-amber-100 px-0.5">{part}</mark>
      : <span key={index}>{part}</span>)}
  </>;
}

export function MemberSearch({
  areas,
  roles,
  initialRows,
  initialTotal,
  canManage,
}: {
  areas: Area[];
  roles: Role[];
  initialRows: Row[];
  initialTotal: number;
  canManage: boolean;
}) {
  const router = useRouter();
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const pageSize = 25;

  const provinceOptions = useMemo(() => areas.filter((area) => levelMatch(area, ["province", "region"]) && area.is_active), [areas]);
  const districtOptions = useMemo(() => areas.filter((area) => levelMatch(area, ["district"]) && area.is_active && (!province || isUnder(areas, area.id, province))), [areas, province]);
  const tehsilOptions = useMemo(() => areas.filter((area) => levelMatch(area, ["tehsil"]) && area.is_active && (!(district || province) || isUnder(areas, area.id, district || province))), [areas, district, province]);
  const localOptions = useMemo(() => areas.filter((area) => levelMatch(area, ["local area", "local_area", "area"]) && area.is_active && (!(tehsil || district || province) || isUnder(areas, area.id, tehsil || district || province))), [areas, tehsil, district, province]);
  const selectedArea = localArea || tehsil || district || province;

  const runSearch = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const response = await fetch("/api/members/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search, area_id: selectedArea || null, member_role_id: role || null, status: status || null, page: nextPage, page_size: pageSize }),
      });
      const payload = await response.json() as { rows?: Row[]; total?: number };
      if (response.ok) {
        setRows(payload.rows ?? []);
        setTotal(Number(payload.total ?? 0));
        setPage(nextPage);
        setActiveIndex(-1);
      }
    } finally {
      setLoading(false);
    }
  }, [search, selectedArea, role, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void runSearch(1), 350);
    return () => window.clearTimeout(timer);
  }, [runSearch]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && rows.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp" && rows.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0 && rows[activeIndex]) {
      event.preventDefault();
      router.push("/dashboard/members/" + rows[activeIndex].id);
    } else if (event.key === "Escape") {
      setSearch("");
      setActiveIndex(-1);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstResult = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const lastResult = Math.min(page * pageSize, total);

  return <section className="space-y-5">
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <label className="sr-only" htmlFor="member-search">Search members</label>
      <input id="member-search" value={search} onChange={(event) => { setSearch(event.target.value); setActiveIndex(-1); }} onKeyDown={handleSearchKeyDown} aria-activedescendant={activeIndex >= 0 ? "member-result-" + rows[activeIndex]?.id : undefined} aria-describedby="member-search-help" placeholder="Search by name, phone, area or member role..." className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-900" />
      <p id="member-search-help" className="mt-2 text-xs text-slate-400">Use ↑ ↓ to move through results and Enter to open one.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <select value={province} onChange={(e) => { setProvince(e.target.value); setDistrict(""); setTehsil(""); setLocalArea(""); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">Province / Region</option>{provinceOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
        <select value={district} onChange={(e) => { setDistrict(e.target.value); setTehsil(""); setLocalArea(""); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">District</option>{districtOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
        <select value={tehsil} onChange={(e) => { setTehsil(e.target.value); setLocalArea(""); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">Tehsil</option>{tehsilOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
        <select value={localArea} onChange={(e) => setLocalArea(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">Local Area</option>{localOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">Member role</option>{roles.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">All status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{total === 0 ? "No matching members" : "Showing " + firstResult.toLocaleString() + "–" + lastResult.toLocaleString() + " of " + total.toLocaleString()}</p>
      {canManage && <Link href="/dashboard/members/new" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add Member</Link>}
    </div>

    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      {loading ? <div className="space-y-3 p-5" aria-live="polite" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
      : rows.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-900">{search || selectedArea || role || status ? "No matching members" : "No members yet"}</p><p className="mt-1 text-sm text-slate-500">{search || selectedArea || role || status ? "Try another search term or clear a filter." : "Add the first member to start building your records."}</p></div>
      : <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="px-4 py-3 font-medium">Member</th><th className="px-4 py-3 font-medium">Phone</th><th className="px-4 py-3 font-medium">Area</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr id={"member-result-" + row.id} key={row.id} className={index === activeIndex ? "bg-slate-50 ring-1 ring-inset ring-slate-300" : "hover:bg-slate-50"}>
          <td className="px-4 py-3"><Link href={"/dashboard/members/" + row.id} className="font-semibold text-slate-900 hover:underline"><Highlight value={row.full_name} query={search} /></Link></td>
          <td className="px-4 py-3 text-slate-600"><Highlight value={row.primary_phone || "—"} query={search} /></td>
          <td className="px-4 py-3"><span className="font-medium"><Highlight value={row.area_name} query={search} /></span><span className="ml-2 text-xs text-slate-400">{prettyLevel(row.area_level)}</span></td>
          <td className="px-4 py-3 text-slate-600"><Highlight value={row.member_role_name} query={search} /></td>
          <td className="px-4 py-3 capitalize text-slate-600">{row.status}</td>
          <td className="px-4 py-3 text-right"><Link className="font-medium text-slate-700 hover:underline" href={"/dashboard/members/" + row.id}>View</Link></td>
        </tr>)}</tbody></table></div>}
    </div>

    {total > pageSize && <div className="flex items-center justify-between gap-3"><button disabled={page === 1 || loading} onClick={() => void runSearch(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200 disabled:opacity-40">Previous</button><span className="text-sm text-slate-500">Page {page} of {totalPages}</span><button disabled={page >= totalPages || loading} onClick={() => void runSearch(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200 disabled:opacity-40">Next</button></div>}
  </section>;
}