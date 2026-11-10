// Remembers that a mistake review was opened from its lesson in this tab, so
// "back to the lesson" can step back in history instead of stacking a duplicate.
const REVIEW_RETURN_KEY = "qazmath.review.return";

export function markReviewOpenedFromLesson(reviewPath: string) {
  try { sessionStorage.setItem(REVIEW_RETURN_KEY, reviewPath); } catch { /* Storage is optional. */ }
}

export function consumeReviewOpenedFromLesson(reviewPath: string): boolean {
  try {
    const opened = sessionStorage.getItem(REVIEW_RETURN_KEY) === reviewPath;
    sessionStorage.removeItem(REVIEW_RETURN_KEY);
    return opened;
  } catch {
    return false;
  }
}
