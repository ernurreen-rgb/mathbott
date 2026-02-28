"use client";

import type { AdminStatistics } from "@/types";
import { formatDateDDMM, toNumber } from "./format";

export interface ActivityTrendPoint {
  date: string;
  label: string;
  count: number;
  unique_users: number;
}

export interface SolutionsTrendPoint {
  date: string;
  label: string;
  count: number;
  correct: number;
  incorrect: number;
}

export interface RegistrationsTrendPoint {
  date: string;
  label: string;
  count: number;
}

export interface QuestionTypeSuccessPoint {
  question_type: string;
  total: number;
  success_rate: number;
}

export interface PieDistributionPoint {
  label: string;
  value: number;
}

const ensureArray = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

export const buildActivityTrendSeries = (stats: AdminStatistics, limit: number = 30): ActivityTrendPoint[] =>
  ensureArray(stats.activity_trends)
    .slice(-limit)
    .map((row) => ({
      date: row.date,
      label: formatDateDDMM(String(row.date || "")),
      count: toNumber(row.count),
      unique_users: toNumber(row.unique_users),
    }));

export const buildSolutionsTrendSeries = (stats: AdminStatistics, limit: number = 90): SolutionsTrendPoint[] =>
  ensureArray(stats.solutions_over_time)
    .slice(-limit)
    .map((row) => {
      const total = toNumber(row.count);
      const correct = toNumber(row.correct);
      const incorrect = Math.max(0, total - correct);
      return {
        date: row.date,
        label: formatDateDDMM(String(row.date || "")),
        count: total,
        correct,
        incorrect,
      };
    });

export const buildRegistrationsTrendSeries = (
  stats: AdminStatistics,
  limit: number = 90
): RegistrationsTrendPoint[] =>
  ensureArray(stats.registrations_over_time)
    .slice(-limit)
    .map((row) => ({
      date: row.date,
      label: formatDateDDMM(String(row.date || "")),
      count: toNumber(row.count),
    }));

export const buildQuestionTypeSuccessSeries = (stats: AdminStatistics): QuestionTypeSuccessPoint[] =>
  ensureArray(stats.question_type_stats).map((row) => ({
    question_type: String(row.question_type || "input").toUpperCase(),
    total: toNumber(row.total),
    success_rate: toNumber(row.success_rate),
  }));

export const buildLeagueDistributionSeries = (stats: AdminStatistics): PieDistributionPoint[] =>
  ensureArray(stats.league_distribution).map((row) => ({
    label: String(row.league || "unknown"),
    value: toNumber(row.count),
  }));

export const buildReportStatusSeries = (stats: AdminStatistics): PieDistributionPoint[] =>
  ensureArray(stats.report_status_distribution).map((row) => ({
    label: String(row.status || "unknown"),
    value: toNumber(row.count),
  }));
