// API URL configuration
// If NEXT_PUBLIC_API_URL is set, use it
// Otherwise, use relative path '/api/backend' or absolute URL for local
export const API_URL = (() => {
  // If NEXT_PUBLIC_API_URL is set, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Default to relative path for Next.js proxy
  return '/api/backend';
})();

export const ALL_LEAGUES = ["Қола", "Күміс", "Алтын", "Платина", "Алмас"];

export const LEAGUE_COLORS: Record<string, string> = {
  "Қола": "from-orange-600 to-orange-800",
  "Күміс": "from-gray-400 to-gray-600",
  "Алтын": "from-yellow-400 to-yellow-600",
  "Платина": "from-cyan-400 to-cyan-600",
  "Алмас": "from-purple-500 to-purple-700",
};

export const LEAGUE_ICONS: Record<string, string> = {
  "Қола": "🥉",
  "Күміс": "🥈",
  "Алтын": "🥇",
  "Платина": "💎",
  "Алмас": "👑",
};

