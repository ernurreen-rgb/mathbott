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

// Set when a review is finished, so the lesson page goes straight on to the next step
// (see pickStepAfterReview) instead of showing the student where they left off.
const REVIEW_FINISHED_KEY = "qazmath.review.finished";

export function markReviewFinished(lessonId: number, miniLessonId: number) {
  try { sessionStorage.setItem(REVIEW_FINISHED_KEY, `${lessonId}:${miniLessonId}`); } catch { /* Storage is optional. */ }
}

/** The mini-lesson whose review was just finished in this lesson, or null; always clears the mark. */
export function consumeFinishedReview(lessonId: number): number | null {
  try {
    const value = sessionStorage.getItem(REVIEW_FINISHED_KEY);
    sessionStorage.removeItem(REVIEW_FINISHED_KEY);
    const [lesson, mini] = (value || "").split(":").map(Number);
    return lesson === lessonId && Number.isInteger(mini) && mini > 0 ? mini : null;
  } catch {
    return null;
  }
}
