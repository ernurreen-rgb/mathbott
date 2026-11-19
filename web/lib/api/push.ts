import { apiPath, fetchWithErrorHandling } from "./client";

export type PushConfig = { enabled: boolean; public_key: string | null };
export type PushSubscriptionKeys = { endpoint: string; keys: { p256dh: string; auth: string } };

// Daily streak reminder: the proxy replaces the email with the signed-in account.
const withEmail = (path: string, email: string) => `${apiPath(path)}?email=${encodeURIComponent(email)}`;

export async function getPushConfig(email: string) {
  return fetchWithErrorHandling<PushConfig>(withEmail("push/config", email), { cache: "no-store" });
}

/** `confirm` sends a test notification right away; a silent re-sync leaves it out. */
export async function savePushSubscription(subscription: PushSubscriptionKeys, email: string, confirm: boolean) {
  return fetchWithErrorHandling<{ subscribed: boolean; confirmation: string | null }>(withEmail("push/subscriptions", email), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...subscription, confirm }),
  });
}

export async function deletePushSubscription(endpoint: string, email: string) {
  return fetchWithErrorHandling<{ unsubscribed: boolean }>(withEmail("push/unsubscribe", email), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export type ReminderPromptAction = "seen" | "offered" | "enabled" | "snoozed" | "failed";

/** What this device could do when the reminder was offered, and what the student chose. */
export async function recordReminderPromptEvent(email: string, deviceState: string, action: ReminderPromptAction) {
  return fetchWithErrorHandling<{ recorded: boolean }>(withEmail("push/prompt-events", email), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_state: deviceState, action }),
  });
}
