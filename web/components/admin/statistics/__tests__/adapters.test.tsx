import { render, screen } from "@testing-library/react";

import type { AdminStatistics } from "@/types";
import StatsChartsSection from "../StatsChartsSection";
import {
  buildActivityTrendSeries,
  buildQuestionTypeSuccessSeries,
  buildRegistrationsTrendSeries,
  buildSolutionsTrendSeries,
} from "../adapters";
import { formatDateDDMM } from "../format";

function makeBaseStats(): AdminStatistics {
  return {
    total_users: 0,
    total_tasks: 0,
    deleted_tasks: 0,
    total_solutions: 0,
    correct_solutions: 0,
    incorrect_solutions: 0,
    total_trial_tests: 0,
    total_trial_test_results: 0,
    total_reports: 0,
    pending_reports: 0,
    resolved_reports: 0,
    overall_success_rate: 0,
    users_registered_today: 0,
    users_registered_week: 0,
    users_registered_month: 0,
    active_users_today: 0,
    active_users_week: 0,
    active_users_month: 0,
    top_users_by_points: [],
    top_users_by_solved: [],
    top_users_by_streak: [],
    avg_user_stats: {
      avg_solved: 0,
      avg_points: 0,
      avg_streak: 0,
      avg_week_points: 0,
    },
    popular_tasks: [],
    difficult_tasks: [],
    easy_tasks: [],
    question_type_stats: [],
    activity_by_day: [],
    activity_by_hour: [],
    activity_trends: [],
    achievement_distribution: [],
    trial_test_stats: [],
    trial_test_results_distribution: [],
    report_status_distribution: [],
    problematic_tasks: [],
    avg_report_resolution_time: 0,
    league_distribution: [],
    league_averages: [],
    registrations_over_time: [],
    solutions_over_time: [],
    module_progress: [],
  };
}

describe("statistics adapters", () => {
  it("builds trend series from valid payload", () => {
    const stats = makeBaseStats();
    stats.activity_trends = [
      { date: "2026-01-10", count: 12, unique_users: 5 },
      { date: "2026-01-11", count: 15, unique_users: 7 },
    ];
    stats.registrations_over_time = [{ date: "2026-01-11", count: 4 }];
    stats.question_type_stats = [{ question_type: "mcq", total: 100, correct: 74, success_rate: 74 }];

    const activity = buildActivityTrendSeries(stats);
    const registrations = buildRegistrationsTrendSeries(stats);
    const questionType = buildQuestionTypeSuccessSeries(stats);

    expect(activity).toHaveLength(2);
    expect(activity[0].label).toBe("10.01");
    expect(activity[1].unique_users).toBe(7);
    expect(registrations[0].count).toBe(4);
    expect(questionType[0].question_type).toBe("MCQ");
    expect(questionType[0].success_rate).toBe(74);
  });

  it("returns empty arrays for empty payload lists", () => {
    const stats = makeBaseStats();
    expect(buildActivityTrendSeries(stats)).toEqual([]);
    expect(buildSolutionsTrendSeries(stats)).toEqual([]);
    expect(buildRegistrationsTrendSeries(stats)).toEqual([]);
    expect(buildQuestionTypeSuccessSeries(stats)).toEqual([]);
  });

  it("computes incorrect answers safely and never below zero", () => {
    const stats = makeBaseStats();
    stats.solutions_over_time = [
      { date: "2026-02-01", count: 20, correct: 8 },
      { date: "2026-02-02", count: 5, correct: 8 },
    ];

    const rows = buildSolutionsTrendSeries(stats);
    expect(rows[0].incorrect).toBe(12);
    expect(rows[1].incorrect).toBe(0);
  });

  it("formats date to dd.MM consistently", () => {
    expect(formatDateDDMM("2026-02-19")).toBe("19.02");
  });
});

describe("StatsChartsSection", () => {
  it("renders period switcher buttons", () => {
    render(<StatsChartsSection stats={makeBaseStats()} />);
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90d" })).toBeInTheDocument();
  });

  it("renders no-data panels when chart series are empty", () => {
    render(<StatsChartsSection stats={makeBaseStats()} />);
    expect(screen.getAllByText(/Деректер жоқ|Р”РµСЂРµРєС‚РµСЂ Р¶РѕТ›/i).length).toBeGreaterThanOrEqual(6);
  });
});
