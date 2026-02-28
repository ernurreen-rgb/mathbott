"use client";

import { useEffect, useState } from "react";
import { UserData } from "@/types";
import { getUserData } from "@/lib/api";

interface UserStatsProps {
  email: string;
}

export function UserStats({ email }: UserStatsProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!email) {
        setLoading(false);
        return;
      }

      const { data, error } = await getUserData(email);
      if (error || !data) {
        // On error or not found, show minimal info
        setUserData({
          id: 0,
          email,
          league: "Қола",
          total_solved: 0,
          week_solved: 0,
          week_points: 0,
          total_points: 0,
        });
      } else {
        setUserData(data);
      }
      setLoading(false);
    };

    fetchUserData();
  }, [email]);

  if (loading) {
    return <div className="text-sm text-gray-600">Жүктелуде...</div>;
  }

  if (!userData) {
    return <div className="text-sm text-gray-700">{email}</div>;
  }

  return (
    <div className="text-sm text-gray-700">
      <span className="font-semibold">{userData.nickname || email}</span>
      {" • "}
      <span className="text-blue-600 font-bold">{userData.league}</span>
      {userData.league_position && userData.league_size && (
        <>
          {" • "}
          <span className="text-gray-600">
            {userData.league_position}/{userData.league_size} лигада
          </span>
        </>
      )}
      {" • "}
      <span>{userData.week_points} ұпай</span>
      {" • "}
      <span className="text-gray-600">{userData.total_solved} шешілген</span>
    </div>
  );
}

