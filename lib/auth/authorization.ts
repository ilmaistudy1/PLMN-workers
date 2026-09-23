import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "super_admin" | "admin" | "area_manager" | "data_entry" | "viewer";

const APP_ROLES = new Set<AppRole>([
  "super_admin",
  "admin",
  "area_manager",
  "data_entry",
  "viewer",
]);

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.account_status !== "active") return null;
  return data.user;
}

export async function getCurrentUserRoles(): Promise<AppRole[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", user.id);

  return (data ?? [])
    .map((row) => {
      const role = row.roles as unknown as { code?: string } | null;
      return role?.code;
    })
    .filter((code): code is AppRole =>
      typeof code === "string" && APP_ROLES.has(code as AppRole),
    );
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAnyRole(allowed: AppRole[]) {
  const user = await requireAuthenticatedUser();
  const roles = await getCurrentUserRoles();
  if (!roles.some((role) => allowed.includes(role))) notFound();
  return { user, roles };
}

export async function requireAdmin() {
  return requireAnyRole(["super_admin", "admin"]);
}

export async function requireSuperAdmin() {
  return requireAnyRole(["super_admin"]);
}
