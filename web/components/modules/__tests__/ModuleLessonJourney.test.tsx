import { render, screen } from "@testing-library/react";

import ModuleLessonJourney, {
  getLessonDisplayName,
  getLessonDisplayProgress,
  getLessonJourneyStatus,
  getNextJourneyLessonId,
  sortJourneyLessons,
  sortJourneySections,
} from "../ModuleLessonJourney";
import type { LessonSummary, Section } from "@/types";

const lesson = (
  id: number,
  completedMiniLessons = 0,
  totalMiniLessons = 4,
  title?: string
): LessonSummary => ({
  id,
  lesson_number: id,
  title,
  sort_order: id,
  progress: {
    completed: completedMiniLessons >= totalMiniLessons,
    completed_mini_lessons: completedMiniLessons,
    total_mini_lessons: totalMiniLessons,
    progress: totalMiniLessons > 0 ? completedMiniLessons / totalMiniLessons : 0,
  },
});

const section = (id: number, lessons: LessonSummary[], order = id): Section => ({
  id,
  name: `${id}-бөлім`,
  sort_order: order,
  lessons,
});

describe("ModuleLessonJourney", () => {
  it("sorts sections and lessons consistently", () => {
    expect(sortJourneySections([section(2, []), section(1, [])]).map((item) => item.id)).toEqual([1, 2]);
    expect(sortJourneyLessons([lesson(3), lesson(1), lesson(2)]).map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("selects the first unfinished lesson across section boundaries", () => {
    const sections = [section(1, [lesson(1, 4), lesson(2, 4)]), section(2, [lesson(3, 2), lesson(4)])];
    expect(getNextJourneyLessonId(sections)).toBe(3);
    expect(getLessonJourneyStatus(sections[1].lessons![0], 3)).toBe("active");
    expect(getLessonJourneyStatus(sections[0].lessons![0], 3)).toBe("completed");
    expect(getLessonJourneyStatus(sections[1].lessons![1], 3)).toBe("upcoming");
  });

  it("uses a visible fallback name and normalizes inconsistent completion progress", () => {
    const item = lesson(7, 2, 4, "   ");
    item.progress!.completed = true;
    item.progress!.progress = 1;

    expect(getLessonDisplayName(item)).toBe("Сабақ 7");
    expect(getLessonDisplayProgress(item)).toBe(0.5);
  });

  it("renders every lesson, one link per lesson, and keeps alternation across sections", () => {
    const firstSection = section(1, [lesson(1, 4)]);
    const secondSection = section(2, [lesson(2), lesson(3), lesson(4), lesson(5), lesson(6), lesson(7)]);
    const { container } = render(<ModuleLessonJourney sections={[firstSection, secondSection]} />);

    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("link", { name: /Сабақ 7/ })).toHaveAttribute("href", "/lessons/7");
    expect(container.querySelector('[data-side="left"] a[href="/lessons/1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-side="right"] a[href="/lessons/2"]')).toBeInTheDocument();
  });

  it("renders empty sections compactly", () => {
    render(<ModuleLessonJourney sections={[section(1, [])]} />);
    expect(screen.getByText("Бұл бөлімде сабақтар әлі қосылмаған.")).toBeInTheDocument();
  });
});
