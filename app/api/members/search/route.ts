import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SearchBody = {
  search?: string;
  area_id?: string | null;
  member_role_id?: string | null;
  status?: string | null;
  level?: string | null;
  page?: number;
  page_size?: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const page = Math.max(1, Math.floor(body.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(body.page_size ?? 25)));

  const { data, error } = await supabase.rpc("search_members", {
    p_search: (body.search ?? "").trim() || null,
    p_area_id: body.area_id || null,
    p_member_role_id: body.member_role_id || null,
    p_status: body.status || null,
    p_level: body.level || null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const rows = data ?? [];
  return NextResponse.json({
    rows,
    total: rows[0]?.total_count ?? 0,
    page,
    page_size: pageSize,
  });
}
