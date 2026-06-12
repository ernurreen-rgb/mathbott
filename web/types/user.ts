export interface RatingUser {
  id: number;
  nickname: string | null;
  league: string;
  league_group?: number;
  total_points: number;
  week_points: number;
  total_solved: number;
}


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
  league: string;
  league_group?: number;
  global_position?: number | null;
  league_position?: number;
  league_size?: number;
  total_solved: number;
  week_solved: number;
  week_points: number;
  total_points: number;
  streak?: number;
  last_streak_date?: string | null;
  recent_activity_timestamps?: string[];
  is_admin?: boolean;
  achievements?: Achievement[];
}
