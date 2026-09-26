import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, getCurrentUserRoles } from "@/lib/auth/authorization";
import { UserAccountManager } from "@/components/users/user-account-manager";

export default async function UserDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAdmin();
  const rolesForActor = await getCurrentUserRoles();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: roles }, { data: areas }, { data: assignments }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("id,email,phone,full_name,account_status,created_at,updated_at").eq("id", id).maybeSingle(),
    supabase.from("roles").select("id,code,name,rank,is_active").order("rank", { ascending: false }),
    supabase.from("areas").select("id,name,level,is_active").order("level").order("name"),
    supabase.from("user_area_assignments").select("user_id,area_id").eq("user_id", id),
    supabase.from("user_roles").select("role_id,roles(id,code,name,rank,is_active)").eq("user_id", id),
  ]);

  if (!profile) notFound();

  const activeRole = (roleRows ?? [])
    .map((row) => row.roles as unknown as { id?: string; code?: string; name?: string; rank?: number; is_active?: boolean } | null)
    .find((role) => role?.is_active);

  const assignedIds = new Set((assignments ?? []).map((item) => item.area_id));

  return (
    <section className="space-y-6">
      <div>
        <nav className="text-xs text-slate-500"><Link href="/dashboard/users" className="hover:underline">Users</Link> / Manage</nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{profile.full_name || "Unnamed account"}</h1>
        <p className="mt-1 text-sm text-slate-500">{profile.email || "No email"} · {profile.account_status}</p>
      </div>

      <UserAccountManager
        actorId={user.id}
        isSuperAdmin={rolesForActor.includes("super_admin")}
        profile={profile}
        roles={roles ?? []}
        areas={areas ?? []}
        assignments={Array.from(assignedIds)}
        activeRoleId={activeRole?.id ?? null}
      />
    </section>
  );
}
