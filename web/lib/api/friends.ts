import { apiPath, fetchWithErrorHandling } from "./client";
import { FriendInvite, FriendInviteDetails, FriendRequestItem, FriendUser, BlockedUser, FriendStatus } from "@/types";


export async function createFriendInvite(
  email: string,
  expiresInDays: number = 1
): Promise<{ data: { token: string; expires_at: string } | null; error: string | null }> {
  return fetchWithErrorHandling<{ token: string; expires_at: string }>(
    apiPath('friends/invites'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, expires_in_days: expiresInDays }),
    }
  );
}


export async function listFriendInvites(
  email: string,
  status?: string
): Promise<{ data: { items: FriendInvite[] } | null; error: string | null }> {
  const url = status
    ? `${apiPath('friends/invites')}?email=${encodeURIComponent(email)}&status=${encodeURIComponent(status)}`
    : `${apiPath('friends/invites')}?email=${encodeURIComponent(email)}`;
  return fetchWithErrorHandling<{ items: FriendInvite[] }>(url);
}


export async function getFriendInviteDetails(
  token: string,
  email?: string
): Promise<{ data: FriendInviteDetails | null; error: string | null }> {
  const url = email
    ? `${apiPath(`friends/invites/${token}`)}?email=${encodeURIComponent(email)}`
    : apiPath(`friends/invites/${token}`);
  return fetchWithErrorHandling<FriendInviteDetails>(url);
}


export async function acceptFriendInvite(
  token: string,
  email: string
): Promise<{ data: { success: boolean; already_friends?: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; already_friends?: boolean }>(
    apiPath(`friends/invites/${token}/accept`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }
  );
}


export async function revokeFriendInvite(
  token: string,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/invites/${token}/revoke`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}


export async function listFriends(
  email: string
): Promise<{ data: { items: FriendUser[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: FriendUser[] }>(
    `${apiPath('friends')}?email=${encodeURIComponent(email)}`
  );
}


export async function removeFriend(
  email: string,
  friendId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/${friendId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}


export async function listFriendRequests(
  email: string,
  direction: "incoming" | "outgoing" = "incoming"
): Promise<{ data: { items: FriendRequestItem[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: FriendRequestItem[] }>(
    `${apiPath('friends/requests')}?email=${encodeURIComponent(email)}&direction=${direction}`
  );
}


export async function declineFriendRequest(
  email: string,
  requestId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/requests/${requestId}/decline`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}


export async function acceptFriendRequest(
  email: string,
  requestId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/requests/${requestId}/accept`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}


export async function cancelFriendRequest(
  email: string,
  requestId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/requests/${requestId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}


export async function blockUser(
  email: string,
  blockedUserId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    apiPath('friends/blocks'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, blocked_user_id: blockedUserId }),
    }
  );
}


export async function unblockUser(
  email: string,
  blockedUserId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/blocks/${blockedUserId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}


export async function sendFriendRequest(
  email: string,
  receiverId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    apiPath('friends/requests'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, receiver_id: receiverId }),
    }
  );
}


export async function getFriendStatus(
  email: string,
  otherId: number
): Promise<{ data: FriendStatus | null; error: string | null }> {
  return fetchWithErrorHandling<FriendStatus>(
    `${apiPath('friends/status')}?email=${encodeURIComponent(email)}&other_id=${otherId}`
  );
}


export async function listBlockedUsers(
  email: string
): Promise<{ data: { items: BlockedUser[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: BlockedUser[] }>(
    `${apiPath('friends/blocks')}?email=${encodeURIComponent(email)}`
  );
}
