"use client";
import { UserData } from "@/types";

type Props = {
  streakAnimated: boolean;
  userData: UserData | null;
  weekDays: { short: string; weekDay: number; }[];
  streakDaysSet: Set<number>;
};

export default function WeekActivityPanel({ streakAnimated, userData, weekDays, streakDaysSet }: Props) {
  return (
    <>
      <div className="glass rounded-3xl shadow-xl p-4 border border-white/30 bg-slate-900/80 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-glow ${streakAnimated ? "animate-bounce" : ""}`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                />
              </svg>
            </div>
            <div className={`flex items-baseline gap-1 ${streakAnimated ? "animate-pulse" : ""}`}>
              <span className="text-2xl font-extrabold text-orange-500">{userData?.streak || 0}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-500">күн</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          {weekDays.map((day) => {
            const isActive = streakDaysSet.has(day.weekDay);
            return (
              <div key={day.short} className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ${isActive
                      ? "bg-gradient-to-br from-orange-400 to-red-500 shadow-glow"
                      : "bg-slate-700"
                    }`}
                >
                  <svg
                    className={`w-3 h-3 ${isActive ? "text-white" : "text-slate-400"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                    />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-black">{day.short}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
