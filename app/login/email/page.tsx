"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function EmailLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await createClient().auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Unable to sign in with those credentials.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to connect to the sign-in service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-500">PLMN Workers</p>
        <h1 className="mt-1 text-2xl font-bold">Existing admin login</h1>
        <p className="mt-2 text-sm text-slate-500">
          Temporary migration login. Once this account has a verified phone number, use the phone login instead.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>

          <label className="block text-sm font-medium">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button disabled={loading} className="w-full" type="submit">
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          <a
            href="/login"
            className="block text-center text-sm font-medium text-slate-500 underline underline-offset-4"
          >
            Back to phone login
          </a>
        </form>
      </section>
    </main>
  );
}
