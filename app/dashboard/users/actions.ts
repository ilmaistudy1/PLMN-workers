"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/authorization";

type AccountStatus = "active" | "disabled";

export async function setUserApplicationRole(userId: string, roleId: string) {
  const { user } = await requireAdmin();
  if (!userId || !roleId || user.id === userId) return { ok: false, message: "That account cannot be changed from this screen." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_application_role", { p_user_id: userId, p_role_id: roleId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/users"); revalidatePath("/dashboard/users/" + userId); revalidatePath("/dashboard/audit");
  return { ok: true, message: "Application role updated." };
}

export async function assignUserArea(userId: string, areaId: string) {
  const { user } = await requireAdmin();
  if (!userId || !areaId || user.id === userId) return { ok: false, message: "That account cannot be changed from this screen." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_area_assignments").insert({ user_id: userId, area_id: areaId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/users"); revalidatePath("/dashboard/users/" + userId); revalidatePath("/dashboard/audit");
  return { ok: true, message: "Area assignment added." };
}

export async function removeUserArea(userId: string, areaId: string) {
  const { user } = await requireAdmin();
  if (!userId || !areaId || user.id === userId) return { ok: false, message: "That account cannot be changed from this screen." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_area_assignments").delete().eq("user_id", userId).eq("area_id", areaId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/users"); revalidatePath("/dashboard/users/" + userId); revalidatePath("/dashboard/audit");
  return { ok: true, message: "Area assignment removed." };
}

export async function setUserAccountStatus(userId: string, status: AccountStatus) {
  const { user } = await requireAdmin();
  if (!userId || user.id === userId) return { ok: false, message: "You cannot change your own account status here." };
  const supabase = await createClient();

  if (status === "disabled") {
    const { data: targetRole } = await supabase.from("user_roles").select("roles(code)").eq("user_id", userId).limit(20);
    const isSuperAdmin = (targetRole ?? []).some((item) => (item.roles as unknown as { code?: string } | null)?.code === "super_admin");
    if (isSuperAdmin) {
      const { data: superRole } = await supabase.from("roles").select("id").eq("code", "super_admin").eq("is_active", true).maybeSingle();
      if (superRole?.id) {
        const { data: superAdminRows } = await supabase.from("user_roles").select("user_id").eq("role_id", superRole.id);
        const superAdminIds = (superAdminRows ?? []).map((item) => item.user_id);
        const { data: activeSuperAdminProfiles } = superAdminIds.length
          ? await supabase.from("profiles").select("id").in("id", superAdminIds).eq("account_status", "active")
          : { data: [] };
        if ((activeSuperAdminProfiles ?? []).length <= 1) return { ok: false, message: "Keep at least one active super admin account." };
      }
    }
  }

  const { error } = await supabase.from("profiles").update({ account_status: status }).eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/users"); revalidatePath("/dashboard/users/" + userId); revalidatePath("/dashboard/audit");
  return { ok: true, message: status === "disabled" ? "Application access disabled." : "Application access restored." };
}
