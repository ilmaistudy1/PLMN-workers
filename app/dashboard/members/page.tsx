import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { MemberSearch } from "@/components/members/member-search";

export default async function MembersPage() {
  await requireAuthenticatedUser();
  const supabase = await createClient();

  const [{ data: areas }, { data: roles }, { data: initialRows }] = await Promise.all([
    supabase.from("areas").select("id,parent_id,name,level,is_active").order("level").order("name"),
    supabase.from("member_roles").select("id,name,is_active").order("name"),
    supabase.rpc("search_members", {
      p_search: null,
      p_area_id: null,
      p_member_role_id: null,
      p_status: null,
      p_level: null,
      p_page: 1,
      p_page_size: 25,
    }),
  ]);

  const rows = initialRows ?? [];
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <nav className="text-xs text-slate-500">Dashboard / Members</nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Members</h1>
          <p className="mt-1 text-sm text-slate-500">Search, review and manage members within your authorized area.</p>
        </div>
        <Link href="/dashboard/members/new" className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Add Member</Link>
      </div>

      <MemberSearch
        areas={areas ?? []}
        roles={roles ?? []}
        initialRows={rows}
        initialTotal={total}
      />
    </section>
  );
}
