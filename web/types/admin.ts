
export type AdminRole = "content_editor" | "reviewer" | "super_admin";


export interface AdminCheckResponse {
  is_admin: boolean;
  role: AdminRole | null;
  is_super_admin: boolean;
  permissions: string[];
}


export interface AdminRoleUserItem {
  id: number;
  email: string;
  role: AdminRole;
  created_at: string;
  last_active: string | null;
}


export interface AdminRoleListResponse {
  items: AdminRoleUserItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}


export interface AdminLeagueGroup {
  league: string;
  league_group: number;
  total_users: number;
  named_users: number;
  week_points: number;
  total_points: number;
}


export interface AdminLeagueGroupListResponse {
  items: AdminLeagueGroup[];
}


export interface AdminLeagueParticipant {
  id: number;
  email: string | null;
  nickname: string | null;
  league: string;
  league_group: number;
  total_points: number;
  week_points: number;
  total_solved: number;
  week_solved: number;
  streak?: number | null;
  created_at?: string | null;
  last_active?: string | null;
}


export interface AdminLeagueParticipantsResponse {
  items: AdminLeagueParticipant[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}


export interface AdminRoleUpdateRequest {
  target_email: string;
  role?: AdminRole;
  remove_admin?: boolean;
}


export interface AdminRoleUpdateResponse {
  success: boolean;
  changed: boolean;
  target_user: {
    id: number;
    email: string;
    previous_role: AdminRole | null;
    new_role: AdminRole | null;
    previous_is_admin?: boolean;
    new_is_admin?: boolean;
  };
  audit_id?: number;
}


export interface AdminRoleRestoreRequest {
  audit_id: number;
}


export interface AdminRoleRestoreResponse {
  success: boolean;
  changed: boolean;
  target_user: {
    id: number;
    email: string;
    previous_role: AdminRole | null;
    new_role: AdminRole | null;
    previous_is_admin: boolean;
    new_is_admin: boolean;
  };
  audit_id?: number;
  restored_from_audit_id: number;
}
