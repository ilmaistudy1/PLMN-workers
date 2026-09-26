"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

function normalizePhone(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");

  if (!digits) return "";
  if (trimmed.startsWith("+")) return "+" + digits;
  if (digits.startsWith("03") && digits.length === 11) return "+92" + digits.slice(1);
  if (digits.startsWith("92") && digits.length >= 10) return "+" + digits;
  return "+" + digits;
}

export async function savePhone(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const raw = String(formData.get("phone") ?? "");
  const phone = normalizePhone(raw);

  if (!/^\+[1-9][0-9]{9,14}$/.test(phone)) {
    return { ok: false, message: "Enter a valid phone number, for example +923001234567." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ phone })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: "Phone number could not be saved. Please try again." };
  }

  redirect("/dashboard");
}
