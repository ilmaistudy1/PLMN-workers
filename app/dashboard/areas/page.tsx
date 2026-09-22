import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/authorization";
import { AreaManager } from "@/components/areas/area-manager";

export default async function AreasPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: areas } = await supabase.from("areas").select("id,parent_id,name,level,is_active").order("level").order("name");
  return <section className="space-y-6"><div><nav className="text-xs text-slate-500">Dashboard / Areas</nav><h1 className="mt-1 text-2xl font-bold text-slate-950">Areas</h1><p className="mt-1 text-sm text-slate-500">Manage the flexible parent/child organizational hierarchy.</p></div><AreaManager initialAreas={areas ?? []} /></section>;
}
