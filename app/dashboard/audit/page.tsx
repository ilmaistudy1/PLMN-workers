import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/authorization";

type SearchParams = {
  user?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
};

function isDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function metadataSummary(value: Record<string, unknown>) {
  const hidden = new Set(["phone", "primary_phone", "alternate_phone", "address", "address_details", "password", "token"]);
  return Object.entries(value)
    .filter(([key]) => !hidden.has(key.toLowerCase()))
    .slice(0, 5)
    .map(([key, item]) => key + ": " + (typeof item === "string" ? item : JSON.stringify(item)))
    .join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: users }, { data: actionRows }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name").order("full_name"),
    supabase.from("audit_logs").select("action,entity_type").order("created_at", { ascending: false }).limit(500),
  ]);

  let query = supabase
    .from("audit_logs")
    .select("id,actor_user_id,action,entity_type,entity_id,area_id,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.user) query = query.eq("actor_user_id", params.user);
  if (params.action) query = query.eq("action", params.action);
  if (params.entity) query = query.eq("entity_type", params.entity);
  if (isDate(params.from)) query = query.gte("created_at", params.from + "T00:00:00.000Z");
  if (isDate(params.to)) query = query.lt("created_at", params.to + "T23:59:59.999Z");

  const { data: logs } = await query;

  const actorIds = [...new Set((logs ?? []).map((row) => row.actor_user_id).filter(Boolean))] as string[];
  const areaIds = [...new Set((logs ?? []).map((row) => row.area_id).filter(Boolean))] as string[];

  const [{ data: actors }, { data: areas }] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id,email,full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
    areaIds.length ? supabase.from("areas").select("id,name,level").in("id", areaIds) : Promise.resolve({ data: [] }),
  ]);

  const actorMap = new Map((actors ?? []).map((item) => [item.id, item]));
  const areaMap = new Map((areas ?? []).map((item) => [item.id, item]));
  const actionOptions = [...new Set((actionRows ?? []).map((item) => item.action))];
  const entityOptions = [...new Set((actionRows ?? []).map((item) => item.entity_type))];

  return (
    <section className="space-y-6">
      <div>
        <nav className="text-xs text-slate-500">Dashboard / Audit Log</nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">Operational changes visible to your administrative scope.</p>
      </div>

      <form className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 xl:grid-cols-5">
        <select name="user" defaultValue={params.user ?? ""} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">All actors</option>
          {(users ?? []).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email || "User"}</option>)}
        </select>
        <select name="action" defaultValue={params.action ?? ""} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">All actions</option>
          {actionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select name="entity" defaultValue={params.entity ?? ""} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">All entities</option>
          {entityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input type="date" name="from" defaultValue={params.from ?? ""} className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
        <input type="date" name="to" defaultValue={params.to ?? ""} className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
        <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Apply filters</button>
          <Link href="/dashboard/audit" className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-slate-200">Clear</Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {(logs ?? []).length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-900">No audit activity found</p>
            <p className="mt-1 text-sm text-slate-500">Try broadening the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Affected record</th>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(logs ?? []).map((log) => {
                  const actor = log.actor_user_id ? actorMap.get(log.actor_user_id) : null;
                  const area = log.area_id ? areaMap.get(log.area_id) : null;
                  const metadata = (log.metadata ?? {}) as Record<string, unknown>;
                  const recordHref =
                    log.entity_type === "member" && log.entity_id
                      ? "/dashboard/members/" + log.entity_id
                      : log.entity_type === "user" && log.entity_id
                        ? "/dashboard/users/" + log.entity_id
                        : null;

                  return (
                    <tr key={log.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">{actor?.full_name || actor?.email || "System"}</p>
                        {actor?.email && <p className="mt-1 text-xs text-slate-500">{actor.email}</p>}
                      </td>
                      <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{log.action}</span></td>
                      <td className="px-4 py-4">
                        {recordHref ? <Link className="font-medium hover:underline" href={recordHref}>{log.entity_type} · {log.entity_id}</Link> : <span>{log.entity_type}{log.entity_id ? " · " + log.entity_id : ""}</span>}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{area ? area.level + " · " + area.name : "—"}</td>
                      <td className="max-w-md px-4 py-4 text-xs leading-5 text-slate-500">{metadataSummary(metadata) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
