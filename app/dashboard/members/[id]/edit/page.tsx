import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/authorization";
import { MemberForm } from "@/components/members/member-form";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyRole(["super_admin", "admin", "area_manager", "data_entry"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: member }, { data: areas }, { data: roles }] = await Promise.all([
    supabase.from("members").select("id,full_name,primary_phone,alternate_phone,address_details,area_id,member_role_id,status").eq("id", id).maybeSingle(),
    supabase.from("areas").select("id,parent_id,name,level,is_active").order("level").order("name"),
    supabase.from("member_roles").select("id,name,is_active").order("name"),
  ]);

  if (!member) notFound();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <nav className="text-xs text-slate-500">
          <Link href={"/dashboard/members/" + id} className="hover:underline">Member</Link> / Edit
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Edit Member</h1>
        <p className="mt-1 text-sm text-slate-500">Updates remain subject to database-backed area permissions.</p>
      </div>
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <MemberForm mode="edit" member={member} areas={areas ?? []} roles={roles ?? []} />
      </div>
    </section>
  );
}
