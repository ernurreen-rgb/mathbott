"use client";
import { UserData } from "@/types";

type Props = {
  userData: UserData;
};

export default function StatisticsPanel({ userData }: Props) {
  return (
    <>
      <div>
        <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">Статистика</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Ударный режим */}
          <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-orange-50 to-red-50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-glow flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-1">{userData?.streak || 0}</div>
                <div className="text-sm font-semibold text-gray-700">Қатарынан күн</div>
              </div>
            </div>
          </div>

          {/* Очки опыта */}
          <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-yellow-50 to-orange-50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-glow flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent mb-1">{userData.total_points || 0}</div>
                <div className="text-sm font-semibold text-gray-700">Тәжірибе ұпайлары</div>
              </div>
            </div>
          </div>

          {/* Решено задач */}
          <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-green-50 to-emerald-50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-glow-green flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-1">
                  {userData?.total_solved || 0}
                </div>
                <div className="text-sm font-semibold text-gray-700">Шешілген есептер</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
