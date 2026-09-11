export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}


export interface UserData {
  id: number;
  email: string;
  nickname?: string;
  total_solved: number;
  total_points: number;
  streak?: number;
  last_streak_date?: string | null;
  recent_activity_timestamps?: string[];
  is_admin?: boolean;
  achievements?: Achievement[];
}
