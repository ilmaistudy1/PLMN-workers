import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, getCurrentUser } from "@/lib/auth/authorization";

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  account_status: "active" | "disabled";
  created_at: string;
  user_roles?: Array<{ roles?: { code?: string; name?: string; rank?: number; is_active?: boolean } | null }>;
  user_area_assignments?: Array<{ areas?: { id?: string; name?: string; level?: string; is_active?: boolean } | null }>;
};

function roleLabel(code: string) {
  return code.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function UsersPage() {
  await requireAdmin();
  const currentUser = await getCurrentUser();
  const supabase = await createClient();

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,account_status,created_at,user_roles(role_id,roles(code,name,rank,is_active)),user_area_assignments(area_id,areas(id,name,level,is_active))")
    .order("created_at", { ascending: false });

  const rows = (users ?? []) as unknown as UserRow[];

  return (
    <section className="space-y-6">
      <div>
        <nav className="text-xs text-slate-500">Dashboard / Users</nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Manage subordinate application accounts, roles and area assignments.</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Users could not be loaded.</div>}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold text-slate-900">No manageable users yet</p>
            <p className="mt-1 text-sm text-slate-500">Create accounts in Supabase Auth, then assign their application role here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Application role</th>
                  <th className="px-4 py-3 font-medium">Assigned areas</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const roles = (row.user_roles ?? []).map((entry) => entry.roles).filter((role): role is NonNullable<typeof role> => Boolean(role?.is_active));
                  const areas = (row.user_area_assignments ?? []).map((entry) => entry.areas).filter((area): area is NonNullable<typeof area> => Boolean(area));
                  const own = currentUser?.id === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">{row.full_name || "Unnamed account"}{own ? " (you)" : ""}</p>
                        <p className="mt-1 text-slate-500">{row.email || "No email"}</p>
                      </td>
                      <td className="px-4 py-4">
                        {roles.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {roles.map((role) => <span key={role.code} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{roleLabel(role.code ?? "role")}</span>)}
                          </div>
                        ) : <span className="text-slate-400">No active role</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-md flex-wrap gap-1.5">
                          {areas.length
                            ? areas.map((area) => <span key={area.id} className={"rounded-full px-2.5 py-1 text-xs " + (area.is_active ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800")}>{area.name}{area.is_active ? "" : " · inactive"}</span>)
                            : <span className="text-slate-400">No assignments</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4"><span className={"rounded-full px-2.5 py-1 text-xs font-medium " + (row.account_status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{row.account_status}</span></td>
                      <td className="px-4 py-4 text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-right"><Link href={"/dashboard/users/" + row.id} className="font-medium text-slate-700 hover:underline">Manage</Link></td>
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
