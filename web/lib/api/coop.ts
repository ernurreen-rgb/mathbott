import { apiPath, fetchWithErrorHandling } from "./client";
import { TrialTestCoopCreateResponse, TrialTestCoopFinishResponse, TrialTestCoopResultsResponse, TrialTestCoopSession } from "@/types";


export async function createTrialTestCoopSession(
  testId: number,
  email: string
): Promise<{ data: TrialTestCoopCreateResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopCreateResponse>(
    apiPath(`trial-tests/${testId}/coop/session`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }
  );
}


export async function getTrialTestCoopSession(
  sessionId: number,
  email: string
): Promise<{ data: TrialTestCoopSession | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopSession>(
    `${apiPath(`trial-tests/coop/session/${sessionId}`)}?email=${encodeURIComponent(email)}`
  );
}


export async function getTrialTestCoopWsToken(
  sessionId: number,
  email: string
): Promise<{ data: { token: string; expires_in: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ token: string; expires_in: number }>(
    `${apiPath(`trial-tests/coop/session/${sessionId}/ws-token`)}?email=${encodeURIComponent(email)}`
  );
}


export async function finishTrialTestCoopSession(
  testId: number,
  sessionId: number,
  email: string,
  answers: Record<number, string>
): Promise<{ data: TrialTestCoopFinishResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopFinishResponse>(
    apiPath(`trial-tests/${testId}/coop/finish`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, session_id: sessionId, answers }),
    }
  );
}


export async function getTrialTestCoopResults(
  sessionId: number,
  email: string
): Promise<{ data: TrialTestCoopResultsResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopResultsResponse>(
    `${apiPath(`trial-tests/coop/session/${sessionId}/results`)}?email=${encodeURIComponent(email)}`
  );
}


export async function inviteFriendToCoopTest(
  testId: number,
  email: string,
  friendId: number
): Promise<{ data: { success: boolean; session_id: number; invite_id?: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; session_id: number; invite_id?: number }>(
    apiPath(`trial-tests/${testId}/coop/invite`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, friend_id: friendId }),
    }
  );
}


export async function getCoopTestInvites(
  email: string
): Promise<{ data: { items: any[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: any[] }>(
    `${apiPath('trial-tests/coop/invites')}?email=${encodeURIComponent(email)}`
  );
}


export async function acceptCoopTestInvite(
  inviteId: number,
  email: string
): Promise<{ data: { success: boolean; session_id: number; trial_test_id: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; session_id: number; trial_test_id: number }>(
    `${apiPath(`trial-tests/coop/invites/${inviteId}/accept`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}


export async function declineCoopTestInvite(
  inviteId: number,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`trial-tests/coop/invites/${inviteId}/decline`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}
