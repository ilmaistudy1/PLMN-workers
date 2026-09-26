"use client";

import { useState, useTransition } from "react";
import { savePhone } from "@/app/setup/phone/actions";

export function PhoneSetupForm({ defaultPhone }: { defaultPhone: string }) {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-6 space-y-4"
      action={(formData) => {
        setMessage("");
        startTransition(async () => {
          const result = await savePhone(formData);
          if (result && !result.ok) setMessage(result.message);
        });
      }}
    >
      <label className="block text-sm font-medium text-slate-800">
        Required phone number
        <input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+923001234567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-slate-900"
        />
      </label>

      {message && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save phone number"}
      </button>
    </form>
  );
}
