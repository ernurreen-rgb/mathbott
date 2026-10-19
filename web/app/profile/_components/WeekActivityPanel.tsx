"use client";
import Icon from "@/components/ui/Icon";

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
              <Icon name="flame" className="w-5 h-5 text-white" />
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
                  <Icon name="flame" className={`w-3 h-3 ${isActive ? "text-white" : "text-slate-400"}`} />
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
