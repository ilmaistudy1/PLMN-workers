import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { PhoneSetupForm } from "@/components/profile/phone-setup-form";

export const metadata = {
  title: "Complete profile · PLMN Workers",
  robots: { index: false, follow: false },
};

export default async function PhoneSetupPage() {
  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone,full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.phone) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-500">PLMN Workers</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Complete your profile</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          A phone number is required for every application account. Email/password remains the sign-in method.
          No SMS OTP is used.
        </p>
        <PhoneSetupForm defaultPhone={profile?.phone ?? ""} />
      </section>
    </main>
  );
}
