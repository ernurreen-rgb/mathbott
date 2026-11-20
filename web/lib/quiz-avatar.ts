export interface QuizAvatarColorOption {
  name: string;
  hex: string;
  bg: string;
}

export interface QuizAvatarCharacterOption {
  id: string;
  name: string;
  emoji: string;
}

export const QUIZ_AVATAR_COLORS: QuizAvatarColorOption[] = [
  { name: "Классикалық", hex: "#f3f4f6", bg: "bg-gray-200" },
  { name: "Күлгін", hex: "#ede9fe", bg: "bg-purple-200" },
  { name: "Көк", hex: "#dbeafe", bg: "bg-blue-200" },
  { name: "Қызғылт", hex: "#fce7f3", bg: "bg-pink-200" },
  { name: "Шабдалы", hex: "#ffedd5", bg: "bg-orange-200" },
  { name: "Жасыл", hex: "#dcfce7", bg: "bg-emerald-200" },
  { name: "Көгілдір", hex: "#cffafe", bg: "bg-cyan-200" },
  { name: "Алтын", hex: "#fef3c7", bg: "bg-amber-200" },
];

export const QUIZ_AVATAR_CHARACTERS: QuizAvatarCharacterOption[] = [
  { id: "barys", name: "Қар Барысы", emoji: "🐆" },
  { id: "fox", name: "Алғыр Түлкі", emoji: "🦊" },
  { id: "wolf", name: "Көкбөрі", emoji: "🐺" },
  { id: "eagle", name: "Алтын Бүркіт", emoji: "🦅" },
  { id: "panda", name: "Панда", emoji: "🐼" },
  { id: "owl", name: "Дана Үкі", emoji: "🦉" },
  { id: "tiger", name: "Жолбарыс", emoji: "🐯" },
  { id: "lion", name: "Арыстан", emoji: "🦁" },
  { id: "raccoon", name: "Енот", emoji: "🦝" },
  { id: "bear", name: "Қоңыр Аю", emoji: "🐻" },
  { id: "cat", name: "Сары Мысық", emoji: "🐱" },
  { id: "penguin", name: "Пингвин", emoji: "🐧" },
  { id: "rabbit", name: "Қоян", emoji: "🐰" },
  { id: "koala", name: "Коала", emoji: "🐨" },
  { id: "pug", name: "Күшік", emoji: "🐶" },
  { id: "dragon", name: "Айдаһар", emoji: "🐉" },
];

const CHARACTER_MAP = new Map(QUIZ_AVATAR_CHARACTERS.map((c) => [c.id, c]));

const LEGACY_COLOR_TO_PASTEL: Record<string, string> = {
  "#8b5cf6": "#ede9fe",
  "#3b82f6": "#dbeafe",
  "#ec4899": "#fce7f3",
  "#f97316": "#ffedd5",
  "#10b981": "#dcfce7",
  "#06b6d4": "#cffafe",
  "#f59e0b": "#fef3c7",
  "#f43f5e": "#ffe4e6",
  "#ef4444": "#fee2e2",
  "#22c55e": "#dcfce7",
  "#6366f1": "#e0e7ff",
  "#a855f7": "#f3e8ff",
  "#14b8a6": "#ccfbf1",
  "#e11d48": "#ffe4e6",
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeHexColor(raw: string): string | null {
  const cleaned = raw.trim();
  return HEX_COLOR_RE.test(cleaned) ? cleaned : null;
}

export function encodeQuizAvatar(color: string, characterId: string): string {
  const cleanColor = sanitizeHexColor(color || "") || QUIZ_AVATAR_COLORS[0].hex;
  const validChar = CHARACTER_MAP.has(characterId) ? characterId : QUIZ_AVATAR_CHARACTERS[0].id;
  return `${cleanColor}:${validChar}`;
}

export function parseQuizAvatar(
  avatarValue?: string | null,
  fallbackSeed: string | number = "player"
): {
  color: string;
  tileBg: string;
  characterId: string;
  character: QuizAvatarCharacterOption;
  encoded: string;
} {
  const seedStr = String(fallbackSeed || "player");
  const hash = hashSeed(seedStr);

  let color = QUIZ_AVATAR_COLORS[0].hex;
  let characterId = QUIZ_AVATAR_CHARACTERS[hash % QUIZ_AVATAR_CHARACTERS.length].id;

  if (avatarValue && typeof avatarValue === "string") {
    const trimmed = avatarValue.trim();
    if (trimmed.includes(":")) {
      const [rawColor, rawChar] = trimmed.split(":", 2);
      const validHex = rawColor ? sanitizeHexColor(rawColor) : null;
      if (validHex) {
        color = validHex;
      }
      if (rawChar && CHARACTER_MAP.has(rawChar)) {
        characterId = rawChar;
      }
    } else {
      const validHex = sanitizeHexColor(trimmed);
      if (validHex) {
        color = validHex;
      } else if (CHARACTER_MAP.has(trimmed)) {
        characterId = trimmed;
      }
    }
  }

  const character = CHARACTER_MAP.get(characterId) || QUIZ_AVATAR_CHARACTERS[0];
  const tileBg = LEGACY_COLOR_TO_PASTEL[color.toLowerCase()] || color || "#f3f4f6";
  return {
    color,
    tileBg,
    characterId: character.id,
    character,
    encoded: `${color}:${character.id}`,
  };
}

export function randomQuizAvatar(): {
  color: string;
  characterId: string;
  character: QuizAvatarCharacterOption;
  encoded: string;
} {
  const colorObj = QUIZ_AVATAR_COLORS[Math.floor(Math.random() * QUIZ_AVATAR_COLORS.length)];
  const character = QUIZ_AVATAR_CHARACTERS[Math.floor(Math.random() * QUIZ_AVATAR_CHARACTERS.length)];
  return {
    color: colorObj.hex,
    characterId: character.id,
    character,
    encoded: encodeQuizAvatar(colorObj.hex, character.id),
  };
}
