"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/authorization";

export async function createArea(input: { name: string; level: string; parent_id?: string | null }) {
  const { user, roles } = await requireAdmin();
  const name = input.name.trim();
  const level = input.level.trim();
  if (name.length < 2 || level.length < 1) return { ok: false, message: "Area name and level are required." };

  if (!input.parent_id && !roles.includes("super_admin")) {
    return { ok: false, message: "Only a super admin can create a root area." };
  }
  if (input.parent_id) {
    const supabase = await createClient();
    const { data: parent } = await supabase.from("areas").select("id,is_active").eq("id", input.parent_id).maybeSingle();
    if (!parent) return { ok: false, message: "Selected parent area is outside your scope." };
    if (!parent.is_active) return { ok: false, message: "Selected parent area is inactive." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("areas").insert({
    name,
    level,
    parent_id: input.parent_id || null,
    created_by: user.id,
  });

  if (error) return { ok: false, message: "Area could not be saved. Refresh and try again." };
  revalidatePath("/dashboard/areas");
  revalidatePath("/dashboard/members");
  return { ok: true, message: "Area created." };
}

export async function updateArea(input: { id: string; name: string; level: string; parent_id?: string | null }) {
  const { roles } = await requireAdmin();
  const name = input.name.trim();
  const level = input.level.trim();
  if (name.length < 2 || level.length < 1) return { ok: false, message: "Area name and level are required." };
  if (!input.parent_id && !roles.includes("super_admin")) {
    return { ok: false, message: "Only a super admin can move an area to root." };
  }
  if (input.parent_id) {
    const supabase = await createClient();
    const { data: parent } = await supabase.from("areas").select("id,is_active").eq("id", input.parent_id).maybeSingle();
    if (!parent) return { ok: false, message: "Selected parent area is outside your scope." };
    if (!parent.is_active) return { ok: false, message: "Selected parent area is inactive." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("areas")
    .update({ name, level, parent_id: input.parent_id || null })
    .eq("id", input.id);

  if (error) return { ok: false, message: "Area could not be updated. Refresh and try again." };
  revalidatePath("/dashboard/areas");
  revalidatePath("/dashboard/members");
  return { ok: true, message: "Area updated." };
}

export async function setAreaActive(id: string, active: boolean) {
  const { roles } = await requireAdmin();
  const supabase = await createClient();

  if (!active) {
    const [{ count: childCount }, { count: memberCount }] = await Promise.all([
      supabase.from("areas").select("id", { count: "exact", head: true }).eq("parent_id", id).eq("is_active", true),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("area_id", id).neq("status", "archived"),
    ]);

    if ((childCount ?? 0) > 0 || (memberCount ?? 0) > 0) {
      return {
        ok: false,
        message: "This area still has active child areas or members. Move them first.",
      };
    }
  }

  const { error } = await supabase.from("areas").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, message: "Area status could not be changed. Refresh and try again." };

  revalidatePath("/dashboard/areas");
  revalidatePath("/dashboard/members");
  return { ok: true, message: active ? "Area activated." : "Area deactivated." };
}
