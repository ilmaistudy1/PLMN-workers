export type AppRole = "super_admin" | "admin" | "area_manager" | "data_entry" | "viewer";

export type MemberStatus = "active" | "inactive" | "archived";

export interface Area {
  id: string;
  parent_id: string | null;
  name: string;
  level: string;
  is_active: boolean;
}

export interface Member {
  id: string;
  full_name: string;
  primary_phone: string | null;
  alternate_phone: string | null;
  address_details: string | null;
  area_id: string;
  member_role_id: string;
  status: MemberStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}
