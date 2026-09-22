import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";

type DashboardStats = {
  total_members: number;
  incomplete_members: number;
  by_area: Array<{ area_id: string; area_name: string; member_count: number }>;
  by_role: Array<{ member_role_id: string; member_role_name: string; member_count: number }>;
  recent_members: Array<{ id: string; full_name: string; status: string; area_name: string; member_role_name: string; created_at: string }>;
};

export default async function DashboardPage() {
  await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_member_dashboard_stats");
  const stats = ((data?.[0] ?? {}) as DashboardStats);
  const total = Number(stats.total_members ?? 0);
  const incomplete = Number(stats.incomplete_members ?? 0);
  const byArea = stats.by_area ?? [];
  const byRole = stats.by_role ?? [];
  const recent = stats.recent_members ?? [];

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <nav className="text-xs text-slate-500">Dashboard</nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Operations overview</h1>
          <p className="mt-1 text-sm text-slate-500">All statistics below respect the current user's database authorization scope.</p>
        </div>
        <Link href="/dashboard/members/new" className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Add Member</Link>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Dashboard statistics could not be loaded.</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total members", total.toLocaleString()],
          ["Incomplete records", incomplete.toLocaleString()],
          ["Visible areas", byArea.length.toLocaleString()],
          ["Member roles in use", byRole.length.toLocaleString()],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-950">Members by area</h2>
            <Link href="/dashboard/members" className="text-sm font-medium text-slate-600 hover:underline">Search</Link>
          </div>
          <div className="mt-4 space-y-3">
            {byArea.length === 0 ? <p className="text-sm text-slate-500">No visible members yet.</p> : byArea.map((item) => (
              <div key={item.area_id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-slate-700">{item.area_name}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{Number(item.member_count).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-950">Members by role</h2>
          <div className="mt-4 space-y-3">
            {byRole.length === 0 ? <p className="text-sm text-slate-500">No visible members yet.</p> : byRole.map((item) => (
              <div key={item.member_role_id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-slate-700">{item.member_role_name}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{Number(item.member_count).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-950">Recently added members</h2>
          <Link href="/dashboard/members" className="text-sm font-medium text-slate-600 hover:underline">View all</Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No members have been added yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-slate-500">
                <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Area</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Added</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3"><Link className="font-medium hover:underline" href={"/dashboard/members/" + item.id}>{item.full_name}</Link></td>
                    <td className="px-3 py-3 text-slate-600">{item.area_name}</td>
                    <td className="px-3 py-3 text-slate-600">{item.member_role_name}</td>
                    <td className="px-3 py-3 text-slate-500">{new Date(item.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
