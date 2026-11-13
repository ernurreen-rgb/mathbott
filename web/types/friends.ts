
export interface FriendUser {
  id: number;
  nickname: string | null;
  total_solved: number;
}

export interface FriendInviteDetails {
  token: string;
  status: "active" | "accepted" | "expired" | "revoked";
  expires_at?: string | null;
  inviter: {
    id: number;
    nickname: string | null;
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
  receiver_id?: number;
  receiver_nickname?: string | null;
}

export interface FriendStatus {
  is_self: boolean;
  is_friend: boolean;
  is_blocked: boolean;
  has_pending_outgoing: boolean;
  has_pending_incoming: boolean;
}
