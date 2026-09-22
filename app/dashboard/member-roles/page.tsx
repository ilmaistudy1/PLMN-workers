import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { MemberRoleManager } from "@/components/member-roles/member-role-manager";

export default async function MemberRolesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: roles } = await supabase.from("member_roles").select("id,name,description,is_active").order("name");
  return <section className="space-y-6"><div><nav className="text-xs text-slate-500">Dashboard / Member Roles</nav><h1 className="mt-1 text-2xl font-bold text-slate-950">Member Roles</h1><p className="mt-1 text-sm text-slate-500">Manage member classifications separately from login-account permissions.</p></div><MemberRoleManager initialRoles={roles ?? []} /></section>;
}
