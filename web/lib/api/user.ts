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

export async function heartbeatPresence(email: string, path?: string) {
  const params = new URLSearchParams({ email });
  if (path) params.set("path", path);
  return fetchWithErrorHandling<{ type: string; users: { id: number; nickname?: string | null }[] }>(
    `${apiPath("presence/heartbeat")}?${params.toString()}`,
    { method: "POST" }
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

/** The interface language saved in the student's profile, or null if they never chose one. */
export async function getUserLanguage(email: string): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await fetchWithErrorHandling<{ language?: string | null }>(
    `${apiPath(`user/web/${encodeURIComponent(email)}`)}?fields=language`
  );
  return { data: data?.language ?? null, error };
}

export async function updateUserLanguage(email: string, language: "kk" | "ru"): Promise<{ data: any | null; error: string | null }> {
  return fetchWithErrorHandling(apiPath("user/web/language"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, language }),
  });
}
