import { apiPath, fetchWithErrorHandling } from "./client";
import { RatingUser } from "@/types";


export async function getRating(
  limit: number = 50,
  league?: string,
  group?: number
): Promise<{ data: RatingUser[] | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (league) query.set("league", league);
  if (typeof group === "number" && Number.isFinite(group) && group >= 0) {
    query.set("group", String(group));
  }
  const url = `${apiPath("rating")}?${query.toString()}`;
  const result = await fetchWithErrorHandling<{ items: RatingUser[]; total: number; limit: number; offset: number; has_more: boolean } | RatingUser[]>(url);
  
  // Transform API response to expected format
  if (result.error) {
    return result as { data: RatingUser[] | null; error: string | null };
  }
  
  if (result.data) {
    // Check if response has 'items' field (new format) or is array directly (old format)
    if (Array.isArray(result.data)) {
      // Direct array response (shouldn't happen with new API, but handle for compatibility)
      return { data: result.data, error: null };
    } else if (result.data && typeof result.data === 'object' && 'items' in result.data) {
      // New format with items field
      return { data: result.data.items || [], error: null };
    }
  }
  
  return { data: [], error: null };
}
