
export interface FriendUser {
  id: number;
  nickname: string | null;
  league: string | null;
  total_points: number;
  total_solved: number;
}


export interface FriendInvite {
  id?: number;
  token: string;
  inviter_id: number;
  status: "active" | "accepted" | "expired" | "revoked";
  expires_at?: string | null;
  accepted_by?: number | null;
  accepted_at?: string | null;
  created_at?: string;
}


export interface FriendInviteDetails {
  token: string;
  status: "active" | "accepted" | "expired" | "revoked";
  expires_at?: string | null;
  inviter: {
    id: number;
    nickname: string | null;
    league: string | null;
  };
  can_accept: boolean;
  is_friend: boolean;
}


export interface FriendRequestItem {
  id: number;
  status: string;
  created_at: string;
  responded_at?: string | null;
  sender_id?: number;
  sender_nickname?: string | null;
  sender_league?: string | null;
  receiver_id?: number;
  receiver_nickname?: string | null;
  receiver_league?: string | null;
}


export interface BlockedUser {
  id: number;
  nickname: string | null;
  league: string | null;
  total_points: number;
  total_solved: number;
  blocked_at?: string | null;
}


export interface FriendStatus {
  is_self: boolean;
  is_friend: boolean;
  is_blocked: boolean;
  has_pending_outgoing: boolean;
  has_pending_incoming: boolean;
}
