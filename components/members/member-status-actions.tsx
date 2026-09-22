"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMemberStatus } from "@/app/dashboard/members/actions";

export function MemberStatusActions({ id, status }: { id: string; status: "active" | "inactive" | "archived" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: "active" | "inactive" | "archived") {
    const message = next === "archived"
      ? "Archive this member?"
      : next === "inactive"
        ? "Deactivate this member?"
        : "Restore this member?";
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await setMemberStatus(id, next);
      if (!result.ok) window.alert(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" && (
        <>
          <button disabled={pending} onClick={() => change("inactive")} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200 disabled:opacity-50">Deactivate</button>
          <button disabled={pending} onClick={() => change("archived")} className="rounded-lg bg-white px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 disabled:opacity-50">Archive</button>
        </>
      )}
      {status !== "active" && (
        <button disabled={pending} onClick={() => change("active")} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">Restore</button>
      )}
    </div>
  );
}
