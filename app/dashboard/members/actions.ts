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

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
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

  const fullName = input.full_name.trim();
  if (fullName.length < 2) return { ok: false, message: "Full name is required." };
  if (!input.area_id || !input.member_role_id) return { ok: false, message: "Area and member role are required." };

  const primary = validatePhone(input.primary_phone, "Primary phone");
  const alternate = validatePhone(input.alternate_phone, "Alternate phone");
  if (!primary.ok) return primary;
  if (!alternate.ok) return alternate;

  const supabase = await createClient();

  const [{ data: phoneDuplicates, error: phoneError }, { data: nameDuplicates, error: nameError }] =
    await Promise.all([
      primary.value
        ? supabase
            .from("members")
            .select("id,full_name,primary_phone,area_id")
            .or(
              `primary_phone_normalized.eq.${primary.value},alternate_phone_normalized.eq.${primary.value}`,
            )
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("members")
        .select("id,full_name,primary_phone,area_id")
        .eq("area_id", input.area_id)
        .ilike("full_name", fullName)
        .limit(5),
    ]);

  if (phoneError || nameError) {
    return { ok: false, message: "Unable to check for duplicates. Please try again." };
  }

  const duplicates = [...(phoneDuplicates ?? []), ...(nameDuplicates ?? [])].filter(
    (member, index, list) => list.findIndex((item) => item.id === member.id) === index,
  );

  if (duplicates.length > 0 && !input.confirm_duplicate) {
    return {
      ok: false,
      type: "duplicate" as const,
      message: "Possible duplicate records found. Review them before saving.",
      duplicates,
    };
  }

  const { error } = await supabase.from("members").insert({
    full_name: fullName,
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

  const fullName = input.full_name.trim();
  if (fullName.length < 2) return { ok: false, message: "Full name is required." };

  const primary = validatePhone(input.primary_phone, "Primary phone");
  const alternate = validatePhone(input.alternate_phone, "Alternate phone");
  if (!primary.ok) return primary;
  if (!alternate.ok) return alternate;

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      full_name: fullName,
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
  revalidatePath(`/dashboard/members/${input.id}`);
  return { ok: true, message: "Member updated successfully." };
}

export async function setMemberStatus(id: string, status: "active" | "inactive" | "archived") {
  await requireAnyRole([...MEMBER_WRITE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/members");
  revalidatePath(`/dashboard/members/${id}`);
  return { ok: true, message: `Member marked ${status}.` };
}

export async function createMemberFromForm(form: FormData) {
  return createMember({
    full_name: value(form, "full_name"),
    primary_phone: value(form, "primary_phone"),
    alternate_phone: value(form, "alternate_phone"),
    address_details: value(form, "address_details"),
    area_id: value(form, "area_id"),
    member_role_id: value(form, "member_role_id"),
    status: (value(form, "status") || "active") as "active" | "inactive" | "archived",
    confirm_duplicate: form.get("confirm_duplicate") === "on",
  });
}
