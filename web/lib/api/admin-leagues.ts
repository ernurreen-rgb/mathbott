import { apiPath, fetchWithErrorHandling } from "./client";
import type { AdminLeagueGroupListResponse, AdminLeagueParticipantsResponse } from "@/types";


export async function getAdminLeagues(
  email: string
): Promise<{ data: AdminLeagueGroupListResponse | null; error: string | null }> {
  return fetchWithErrorHandling<AdminLeagueGroupListResponse>(
    `${apiPath("admin/leagues")}?email=${encodeURIComponent(email)}`
  );
}


export async function getAdminLeagueParticipants(
  email: string,
  league: string,
  group: number,
  params?: { limit?: number; offset?: number }
): Promise<{ data: AdminLeagueParticipantsResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("league", league);
  query.set("group", String(group));
  query.set("limit", String(params?.limit ?? 100));
  query.set("offset", String(params?.offset ?? 0));
  return fetchWithErrorHandling<AdminLeagueParticipantsResponse>(
    `${apiPath("admin/leagues/participants")}?${query.toString()}`
  );
}
