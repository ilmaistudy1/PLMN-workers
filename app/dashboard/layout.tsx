import type { Metadata } from "next";
import { getCurrentUserRoles, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  const roles = await getCurrentUserRoles();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar roles={roles} />
      <div className="min-w-0 flex-1">
        <Topbar email={user.email ?? null} />
        <main className="p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
