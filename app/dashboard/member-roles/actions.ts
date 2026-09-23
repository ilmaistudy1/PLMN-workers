"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/authorization";

export async function createMemberRole(input: { name: string; description: string }) {
  const { user } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, message: "Role name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("member_roles").insert({
    name,
    description: input.description.trim() || null,
    created_by: user.id,
  });

  if (error) return { ok: false, message: "Member role could not be saved. Refresh and try again." };
  revalidatePath("/dashboard/member-roles");
  revalidatePath("/dashboard/members");
  return { ok: true, message: "Member role created." };
}

export async function updateMemberRole(input: { id: string; name: string; description: string; is_active: boolean }) {
  await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, message: "Role name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("member_roles")
    .update({
      name,
      description: input.description.trim() || null,
      is_active: input.is_active,
    })
    .eq("id", input.id);

  if (error) return { ok: false, message: "Member role could not be updated. Refresh and try again." };
  revalidatePath("/dashboard/member-roles");
  revalidatePath("/dashboard/members");
  return { ok: true, message: "Member role updated." };
}
