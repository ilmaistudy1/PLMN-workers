import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/authorization";
import { MemberForm } from "@/components/members/member-form";

export default async function NewMemberPage() {
  await requireAnyRole(["super_admin", "admin", "area_manager", "data_entry"]);
  const supabase = await createClient();

  const [{ data: areas }, { data: roles }] = await Promise.all([
    supabase.from("areas").select("id,parent_id,name,level,is_active").eq("is_active", true).order("level").order("name"),
    supabase.from("member_roles").select("id,name,is_active").order("name"),
  ]);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <nav className="text-xs text-slate-500">
          <Link href="/dashboard/members" className="hover:underline">Members</Link> / New Member
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Add Member</h1>
        <p className="mt-1 text-sm text-slate-500">Capture the essential record quickly. Original phone input is preserved.</p>
      </div>
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <MemberForm mode="create" areas={areas ?? []} roles={roles ?? []} />
      </div>
    </section>
  );
}
