"use client";

import Link from "next/link";
import { LayoutDashboard, Map, Menu, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const links = [
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/dashboard/members", "Members", UsersRound],
    ["/dashboard/areas", "Areas", Map],
    ["/dashboard/member-roles", "Member Roles", ShieldCheck],
  ] as const;

  return (
    <>
      <button type="button" aria-label="Open navigation" onClick={() => setOpen(true)} className="fixed left-4 top-4 z-30 rounded-lg bg-slate-900 p-2 text-white md:hidden">
        <Menu size={20} />
      </button>
      {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={"fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white p-4 transition-transform md:static md:translate-x-0 " + (open ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-8 px-3">
          <p className="text-lg font-bold text-slate-950">PLMN Workers</p>
          <p className="text-xs text-slate-500">Internal management system</p>
        </div>
        <nav className="space-y-1">
          {links.map(([href, label, Icon]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Icon size={18} />{label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
