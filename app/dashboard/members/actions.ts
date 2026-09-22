"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/authorization";

const MEMBER_WRITE_ROLES = ["super_admin", "admin", "area_manager", "data_entry"] as const;

function normalizePhone(value: string) {
  const normalized = value.replace(/[^0-9]+/g, "");
  return normalized || null;
}

function validatePhone(value: string, label: string) {
  const normalized = normalizePhone(value);
  if (value.trim() && (!normalized || normalized.length < 7 || normalized.length > 15)) {
    return { ok: false as const, message: label + " must contain 7-15 digits." };
  }
  return { ok: true as const, value: normalized };
}

function cleanText(value: string, label: string, minLength = 0) {
  const cleaned = value.trim();
  if (cleaned.length < minLength) return { ok: false as const, message: label + " is required." };
  return { ok: true as const, value: cleaned };
}

async function validateMemberReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  areaId: string,
  roleId: string,
) {
  const [{ data: area }, { data: role }] = await Promise.all([
    supabase.from("areas").select("id,is_active").eq("id", areaId).maybeSingle(),
    supabase.from("member_roles").select("id,is_active").eq("id", roleId).maybeSingle(),
  ]);

  if (!area) return { ok: false as const, message: "Selected area is not available in your authorization scope." };
  if (!area.is_active) return { ok: false as const, message: "Selected area is inactive. Choose an active area." };
  if (!role) return { ok: false as const, message: "Selected member role is not available." };
  if (!role.is_active) return { ok: false as const, message: "Selected member role is inactive." };
  return { ok: true as const };
}

async function findDuplicateMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: { memberId?: string; primary: string | null; fullName: string; areaId: string },
) {
  const [{ data: phoneDuplicates }, { data: nameDuplicates }] = await Promise.all([
    options.primary
      ? supabase
          .from("members")
          .select("id,full_name,primary_phone,area_id")
          .or("primary_phone_normalized.eq." + options.primary + ",alternate_phone_normalized.eq." + options.primary)
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase
      .from("members")
      .select("id,full_name,primary_phone,area_id")
      .eq("area_id", options.areaId)
      .ilike("full_name", options.fullName)
      .limit(5),
  ]);

  return [...(phoneDuplicates ?? []), ...(nameDuplicates ?? [])]
    .filter((member) => member.id !== options.memberId)
    .filter((member, index, list) => list.findIndex((item) => item.id === member.id) === index);
}

export async function createMember(input: {
  full_name: string;
  primary_phone: string;
  alternate_phone: string;
  address_details: string;
  area_id: string;
  member_role_id: string;
  status: "active" | "inactive" | "archived";
  confirm_duplicate?: boolean;
}) {
  const { user } = await requireAnyRole([...MEMBER_WRITE_ROLES]);
  const fullName = cleanText(input.full_name, "Full name", 2);
  if (!fullName.ok) return fullName;

  if (!input.area_id || !input.member_role_id) {
    return { ok: false as const, message: "Area and member role are required." };
  }

  const primary = validatePhone(input.primary_phone, "Primary phone");
  const alternate = validatePhone(input.alternate_phone, "Alternate phone");
  if (!primary.ok) return primary;
  if (!alternate.ok) return alternate;

  const supabase = await createClient();
  const references = await validateMemberReferences(supabase, input.area_id, input.member_role_id);
  if (!references.ok) return references;

  const duplicates = await findDuplicateMembers(supabase, {
    primary: primary.value,
    fullName: fullName.value,
    areaId: input.area_id,
  });

  if (duplicates.length > 0 && !input.confirm_duplicate) {
    return {
      ok: false as const,
      type: "duplicate" as const,
      message: "Possible duplicate records found. Review them before saving.",
      duplicates,
    };
  }

  const { error } = await supabase.from("members").insert({
    full_name: fullName.value,
    primary_phone: input.primary_phone.trim() || null,
    alternate_phone: input.alternate_phone.trim() || null,
    address_details: input.address_details.trim() || null,
    area_id: input.area_id,
    member_role_id: input.member_role_id,
    status: input.status,
    created_by: user.id,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/members");
  return { ok: true, message: "Member created successfully." };
}

export async function updateMember(input: {
  id: string;
  full_name: string;
  primary_phone: string;
  alternate_phone: string;
  address_details: string;
  area_id: string;
  member_role_id: string;
  status: "active" | "inactive" | "archived";
}) {
  await requireAnyRole([...MEMBER_WRITE_ROLES]);

  const fullName = cleanText(input.full_name, "Full name", 2);
  if (!fullName.ok) return fullName;

  const primary = validatePhone(input.primary_phone, "Primary phone");
  const alternate = validatePhone(input.alternate_phone, "Alternate phone");
  if (!primary.ok) return primary;
  if (!alternate.ok) return alternate;

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("members")
    .select("id,area_id")
    .eq("id", input.id)
    .maybeSingle();

  if (existingError || !existing) return { ok: false, message: "Member record is unavailable or outside your scope." };

  if (input.area_id !== existing.area_id) {
    const references = await validateMemberReferences(supabase, input.area_id, input.member_role_id);
    if (!references.ok) return references;
  }

  const roleCheck = await supabase
    .from("member_roles")
    .select("id,is_active")
    .eq("id", input.member_role_id)
    .maybeSingle();

  if (!roleCheck.data) return { ok: false, message: "Selected member role is not available." };
  if (!roleCheck.data.is_active) return { ok: false, message: "Selected member role is inactive." };

  const duplicates = await findDuplicateMembers(supabase, {
    memberId: input.id,
    primary: primary.value,
    fullName: fullName.value,
    areaId: input.area_id,
  });

  if (duplicates.length > 0) {
    return {
      ok: false as const,
      type: "duplicate" as const,
      message: "A similar record already exists. Review the existing record before saving.",
      duplicates,
    };
  }

  const { error } = await supabase
    .from("members")
    .update({
      full_name: fullName.value,
      primary_phone: input.primary_phone.trim() || null,
      alternate_phone: input.alternate_phone.trim() || null,
      address_details: input.address_details.trim() || null,
      area_id: input.area_id,
      member_role_id: input.member_role_id,
      status: input.status,
    })
    .eq("id", input.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/members/" + input.id);
  return { ok: true, message: "Member updated successfully." };
}

export async function setMemberStatus(id: string, status: "active" | "inactive" | "archived") {
  await requireAnyRole([...MEMBER_WRITE_ROLES]);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("members").select("id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Member record is unavailable or outside your scope." };

  const { error } = await supabase.from("members").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/members/" + id);
  return { ok: true, message: "Member status changed to " + status + "." };
}
