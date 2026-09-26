"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

function normalizePhone(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (trimmed.startsWith("+")) return "+" + digits;
  if (digits.startsWith("03") && digits.length === 11) return "+92" + digits.slice(1);
  if (digits.startsWith("92")) return "+" + digits;
  return "+" + digits;
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [sentPhone, setSentPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode() {
    setError("");
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.replace(/[^0-9]/g, "").length < 10) {
      setError("Enter a valid phone number, for example +923001234567.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await createClient().auth.signInWithOtp({
        phone: normalized,
        options: { shouldCreateUser: false },
      });

      if (authError) {
        setError("We could not send the verification code. Check the number or contact an administrator.");
        return;
      }

      setSentPhone(normalized);
      setStep("otp");
    } catch {
      setError("Unable to connect to the phone sign-in service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await createClient().auth.verifyOtp({
        phone: sentPhone,
        token: code.trim(),
        type: "sms",
      });

      if (authError) {
        setError("That verification code is invalid or expired.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to verify the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <div className="mb-7">
          <p className="text-sm font-semibold text-slate-500">PLMN Workers</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in with phone</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your phone number is verified by a one-time code. Email is optional for your account.
          </p>
        </div>

        {step === "phone" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void requestCode();
            }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium">
              Phone number
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+923001234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button disabled={loading} className="w-full" type="submit">
              {loading ? "Sending code..." : "Send verification code"}
            </Button>

            <a
              href="/login/email"
              className="block text-center text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Existing admin: use email login
            </a>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verifyCode();
            }}
            className="space-y-4"
          >
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Code sent to <span className="font-semibold">{sentPhone}</span>
            </div>

            <label className="block text-sm font-medium">
              6-digit code
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 tracking-[0.4em]"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button disabled={loading} className="w-full" type="submit">
              {loading ? "Verifying..." : "Verify and sign in"}
            </Button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setCode("");
                setError("");
                setStep("phone");
              }}
              className="w-full text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Change phone number
            </button>
          </form>
        )}

        <a
          href="/mobile"
          className="mt-5 block text-center text-sm font-medium text-slate-600 underline underline-offset-4"
        >
          Open the mobile offline app
        </a>
      </section>
    </main>
  );
}
