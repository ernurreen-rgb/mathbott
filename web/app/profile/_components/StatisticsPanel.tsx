"use client";
import Icon from "@/components/ui/Icon";

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
                <Icon name="flame" className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-1">{userData?.streak || 0}</div>
                <div className="text-sm font-semibold text-gray-700">Қатарынан күн</div>
              </div>
            </div>
          </div>

          {/* Решено задач */}
          <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-green-50 to-emerald-50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-glow-green flex-shrink-0">
                <Icon name="checkCircle" className="w-6 h-6 text-white" />
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
