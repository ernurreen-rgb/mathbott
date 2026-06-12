import { apiPath, fetchWithErrorHandling } from "./client";
import { UserData } from "@/types";


export async function getUserData(email: string): Promise<{ data: UserData | null; error: string | null }> {
  return fetchWithErrorHandling<UserData>(
    apiPath(`user/web/${encodeURIComponent(email)}`)
  );
}


export async function getPresenceWsToken(
  email: string
): Promise<{ data: { token: string; expires_in: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ token: string; expires_in: number }>(
    `${apiPath("presence/ws-token")}?email=${encodeURIComponent(email)}`
  );
}


export async function getPublicUserData(email: string): Promise<{ data: UserData | null; error: string | null }> {
  return fetchWithErrorHandling<UserData>(
    apiPath(`user/public/${encodeURIComponent(email)}`)
  );
}


export async function getPublicUserDataById(userId: number): Promise<{ data: UserData | null; error: string | null }> {
  // Use the unified endpoint that accepts both ID and email
  return fetchWithErrorHandling<UserData>(
    apiPath(`user/public/${userId}`)
  );
}


export async function updateNickname(email: string, nickname: string): Promise<{ data: any | null; error: string | null }> {
  return fetchWithErrorHandling(
    apiPath('user/web/nickname'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nickname }),
    }
  );
}
