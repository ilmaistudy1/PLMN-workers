import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { MemberStatusActions } from "@/components/members/member-status-actions";

export default async function MemberDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuthenticatedUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: member, error } = await supabase
    .from("members")
    .select("id,full_name,primary_phone,alternate_phone,address_details,area_id,member_role_id,status,created_at,updated_at,areas(name,level),member_roles(name)")
    .eq("id", id)
    .maybeSingle();

  if (error || !member) notFound();

  const area = Array.isArray(member.areas) ? member.areas[0] : member.areas;
  const memberRole = Array.isArray(member.member_roles) ? member.member_roles[0] : member.member_roles;

  return (
    <section className="space-y-6">
      <div>
        <nav className="text-xs text-slate-500">
          <Link href="/dashboard/members" className="hover:underline">Members</Link> / Details
        </nav>
        <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{member.full_name}</h1>
            <p className="mt-1 text-sm capitalize text-slate-500">{member.status} member</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={"/dashboard/members/" + id + "/edit"} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Edit</Link>
            <MemberStatusActions id={id} status={member.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:col-span-2">
          <h2 className="font-semibold text-slate-950">Member information</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Primary phone</dt><dd className="mt-1 text-sm text-slate-800">{member.primary_phone || "Not provided"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Alternate phone</dt><dd className="mt-1 text-sm text-slate-800">{member.alternate_phone || "Not provided"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Area</dt><dd className="mt-1 text-sm text-slate-800">{area?.name || "Not available"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Area level</dt><dd className="mt-1 text-sm capitalize text-slate-800">{area?.level || "Not available"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Member role</dt><dd className="mt-1 text-sm text-slate-800">{memberRole?.name || "Not available"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</dt><dd className="mt-1 text-sm text-slate-800">{new Date(member.created_at).toLocaleString()}</dd></div>
          </dl>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Address / details</dt>
            <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{member.address_details || "No additional details."}</dd>
          </div>
        </div>

        <aside className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-950">Record status</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Created and updated timestamps are kept for auditability. Sensitive fields are not placed in page URLs.</p>
          <p className="mt-4 text-xs text-slate-400">Last updated {new Date(member.updated_at).toLocaleString()}</p>
        </aside>
      </div>
    </section>
  );
}
