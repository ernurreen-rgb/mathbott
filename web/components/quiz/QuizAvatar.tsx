"use client";
import Icon from "@/components/ui/Icon";


import React from "react";

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

export function encodeQuizAvatar(color: string, characterId: string): string {
  const cleanColor = (color || QUIZ_AVATAR_COLORS[0].hex).trim();
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
      if (rawColor && rawColor.startsWith("#")) {
        color = rawColor;
      }
      if (rawChar && CHARACTER_MAP.has(rawChar)) {
        characterId = rawChar;
      }
    } else if (trimmed.startsWith("#")) {
      color = trimmed;
    } else if (CHARACTER_MAP.has(trimmed)) {
      characterId = trimmed;
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

/**
 * Shared concentric flat-vector eyes + eyebrows in a unified minimal design language
 */
function KahootEyes({
  leftX = 43.5,
  rightX = 76.5,
  y = 60,
  irisColor = "#5c2d16",
  socketColor,
  browColor = "#4a200d",
  scleraRadius = 10.5,
  irisRadius = 6.2,
  pupilRadius = 3.8,
  browOffsetY = -14.5,
}: {
  leftX?: number;
  rightX?: number;
  y?: number;
  irisColor?: string;
  socketColor?: string;
  browColor?: string;
  scleraRadius?: number;
  irisRadius?: number;
  pupilRadius?: number;
  browOffsetY?: number;
}) {
  return (
    <g>
      {socketColor && (
        <>
          <ellipse cx={leftX} cy={y + 0.5} rx={scleraRadius + 2.2} ry={scleraRadius + 2.5} fill={socketColor} />
          <ellipse cx={rightX} cy={y + 0.5} rx={scleraRadius + 2.2} ry={scleraRadius + 2.5} fill={socketColor} />
        </>
      )}
      {/* Left Eye */}
      <circle cx={leftX} cy={y} r={scleraRadius} fill="#ffffff" />
      <circle cx={leftX} cy={y} r={irisRadius} fill={irisColor} />
      <circle cx={leftX} cy={y} r={pupilRadius} fill="#18181b" />
      {/* Right Eye */}
      <circle cx={rightX} cy={y} r={scleraRadius} fill="#ffffff" />
      <circle cx={rightX} cy={y} r={irisRadius} fill={irisColor} />
      <circle cx={rightX} cy={y} r={pupilRadius} fill="#18181b" />
      {/* Eyebrows */}
      <path
        d={`M ${leftX - 8.5} ${y + browOffsetY + 1.5} Q ${leftX} ${y + browOffsetY - 2.5} ${leftX + 8.5} ${y + browOffsetY + 1}`}
        stroke={browColor}
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M ${rightX - 8.5} ${y + browOffsetY + 1} Q ${rightX} ${y + browOffsetY - 2.5} ${rightX + 8.5} ${y + browOffsetY + 1.5}`}
        stroke={browColor}
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function CharacterSvg({ characterId }: { characterId: string }) {
  switch (characterId) {
    case "barys":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Rounded Snow Leopard Ears with Dark Rim */}
          <circle cx="25" cy="38" r="12" fill="#334155" />
          <circle cx="95" cy="38" r="12" fill="#334155" />
          <circle cx="26" cy="39" r="7.5" fill="#cbd5e1" />
          <circle cx="94" cy="39" r="7.5" fill="#cbd5e1" />
          {/* Tufted Frost-Silver Head */}
          <path
            d="M60 23 L56 18 L54 24 L49 20 L49 26 C33 30 22 44 20 62 L14 68 L20 72 L15 80 L23 83 L20 90 C31 100 45 105 60 105 C75 105 89 100 100 90 L97 83 L105 80 L100 72 L106 68 L100 62 C98 44 87 30 71 26 L71 20 L66 24 L64 18 Z"
            fill="#cbd5e1"
          />
          {/* White Lower Cheek & Chin Fur */}
          <path
            d="M22 73 C32 69 43 73 48 80 C53 75 67 75 72 80 C77 73 88 69 98 73 C94 91 79 104 60 104 C41 104 26 91 22 73 Z"
            fill="#f1f5f9"
          />
          {/* Characteristic Snow Leopard Rosette Spots */}
          <ellipse cx="60" cy="34" rx="4.5" ry="3" fill="#475569" />
          <ellipse cx="49" cy="38" rx="3.5" ry="2.5" fill="#475569" />
          <ellipse cx="71" cy="38" rx="3.5" ry="2.5" fill="#475569" />
          <circle cx="27" cy="67" r="3" fill="#475569" />
          <circle cx="32" cy="75" r="2.5" fill="#475569" />
          <circle cx="93" cy="67" r="3" fill="#475569" />
          <circle cx="88" cy="75" r="2.5" fill="#475569" />
          {/* Muzzle */}
          <ellipse cx="60" cy="83" rx="18" ry="14.5" fill="#f8fafc" />
          <KahootEyes leftX={43} rightX={77} y={59} irisColor="#0284c7" socketColor="#64748b" browColor="#334155" />
          {/* Nose */}
          <path d="M52 74 Q60 71 68 74 Q65 81 60 82 Q55 81 52 74 Z" fill="#334155" />
          <ellipse cx="60" cy="74.2" rx="4.5" ry="1.5" fill="#64748b" />
          <line x1="60" y1="82" x2="60" y2="88" stroke="#334155" strokeWidth="2.5" />
          <path d="M50 88 Q60 93 70 88" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "fox":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Outer Ears */}
          <path d="M21 52 C14 35 15 19 20 13 C27 15 41 24 47 34 Z" fill="#f94d1c" />
          <path d="M99 52 C106 35 105 19 100 13 C93 15 79 24 73 34 Z" fill="#f94d1c" />
          {/* Dark Ear Tips */}
          <path d="M16.5 26 C17 19 18.5 14.5 20 13 C24.5 14.5 31 18.5 35.5 23 C28 22 21 23.5 16.5 26 Z" fill="#431a08" />
          <path d="M103.5 26 C103 19 101.5 14.5 100 13 C95.5 14.5 89 18.5 84.5 23 C92 22 99 23.5 103.5 26 Z" fill="#431a08" />
          {/* Inner Cream Ears */}
          <path d="M24 46 C19 34 20 22 22.5 18 C28 20 37 27 41 35 Z" fill="#ffcca3" />
          <path d="M96 46 C101 34 100 22 97.5 18 C92 20 83 27 79 35 Z" fill="#ffcca3" />
          {/* Main Tufted Head Silhouette */}
          <path
            d="M60 24 C56 18 52 21 54 25 C50 21 46 24 48 28 C33 31 23 44 21 61 L14 67 L20 70 L13 79 L22 81 L18 89 C29 99 44 105 60 105 C76 105 91 99 102 89 L98 81 L107 79 L100 70 L106 67 L99 61 C97 44 87 31 72 28 C74 24 70 21 66 25 C68 21 64 18 60 24 Z"
            fill="#ff5722"
          />
          {/* Cream Cheek & Chin Mask */}
          <path
            d="M22 72 C32 69 43 74 48 82 C52 76 68 76 72 82 C77 74 88 69 98 72 C95 89 80 103 60 103 C40 103 25 89 22 72 Z"
            fill="#ffd8b5"
          />
          {/* Nose Bridge Shading */}
          <ellipse cx="60" cy="68" rx="9" ry="12" fill="#e64a19" />
          {/* Muzzle Puff */}
          <ellipse cx="60" cy="84" rx="18" ry="15" fill="#ffe4cc" />
          <KahootEyes leftX={43} rightX={77} y={59} irisColor="#5c2810" socketColor="#d84315" browColor="#7c2d12" />
          {/* Sculpted Nose */}
          <ellipse cx="60" cy="76.5" rx="9.5" ry="6.8" fill="#5c2209" />
          <ellipse cx="60" cy="74.2" rx="6" ry="2.2" fill="#853512" />
          {/* Smile */}
          <path d="M50 89 Q60 94.5 70 89" stroke="#5c2209" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M55 93.5 Q60 95.5 65 93.5" stroke="#e0b58e" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "wolf":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Ears */}
          <path d="M24 50 C19 33 21 17 27 12 C35 16 45 25 49 35 Z" fill="#94a3b8" />
          <path d="M96 50 C101 33 99 17 93 12 C85 16 75 25 71 35 Z" fill="#94a3b8" />
          <path d="M27 45 C23 33 25 21 28.5 17 C34 20 41 27 44 35 Z" fill="#cbd5e1" />
          <path d="M93 45 C97 33 95 21 91.5 17 C86 20 79 27 76 35 Z" fill="#cbd5e1" />
          {/* Tufted Head */}
          <path
            d="M60 22 L56 17 L54 24 L49 19 L49 27 C34 31 24 44 21 60 L13 67 L20 71 L14 80 L23 82 L20 90 C31 99 45 106 60 106 C75 106 89 99 100 90 L97 82 L106 80 L100 71 L107 67 L99 60 C96 44 86 31 71 27 L71 19 L66 24 L64 17 Z"
            fill="#94a3b8"
          />
          {/* Forehead & Cheek Darker Mask */}
          <path
            d="M60 27 C42 27 29 41 28 62 C34 50 48 48 55 62 L60 72 L65 62 C72 48 86 50 92 62 C91 41 78 27 60 27 Z"
            fill="#78879c"
          />
          {/* Light Grey Cheek & Jaw Fur */}
          <path
            d="M24 72 C33 68 44 72 49 80 C53 74 67 74 71 80 C76 72 87 68 96 72 C92 91 77 105 60 105 C43 105 28 91 24 72 Z"
            fill="#e2e8f0"
          />
          <ellipse cx="60" cy="84" rx="17" ry="15" fill="#f1f5f9" />
          <KahootEyes leftX={43.5} rightX={76.5} y={59} irisColor="#334155" socketColor="#64748b" browColor="#334155" />
          {/* Black Wolf Nose */}
          <path d="M51 74 Q60 71 69 74 Q67 82 60 83 Q53 82 51 74 Z" fill="#0f172a" />
          <ellipse cx="60" cy="74.5" rx="5.5" ry="1.8" fill="#334155" />
          {/* Smile */}
          <path d="M50 89 Q60 93.5 70 89" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M55 93.5 Q60 95.5 65 93.5" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "eagle":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Golden Crown Feather Crest */}
          <path d="M60 12 L55 22 L47 15 L48 26 L72 26 L73 15 L65 22 Z" fill="#d97706" />
          {/* Dark Bronze Eagle Head Silhouette with Side Feather Tufts */}
          <path
            d="M60 21 C38 21 24 34 21 56 L13 63 L21 67 L14 76 L24 79 L20 87 C31 99 44 104 60 104 C76 104 89 99 100 87 L96 79 L106 76 L99 67 L107 63 L99 56 C96 34 82 21 60 21 Z"
            fill="#5c2810"
          />
          {/* Golden-Bronze Forehead Cap */}
          <path d="M27 50 C31 31 43 22 60 22 C77 22 89 31 93 50 C80 42 68 43 60 51 C52 43 40 42 27 50 Z" fill="#92400e" />
          {/* Warm Cream-Gold Lower Cheek Feathers */}
          <path
            d="M24 71 C33 67 44 71 50 78 L70 78 C76 71 87 67 96 71 C91 90 77 102 60 102 C43 102 29 90 24 71 Z"
            fill="#fde68a"
          />
          {/* Fierce Concentric Golden Eyes */}
          <KahootEyes leftX={43} rightX={77} y={58} irisColor="#d97706" socketColor="#3b1706" browColor="#d97706" />
          {/* Proud Angled Eagle Brow Ridges */}
          <path d="M26 44 L55 51 L53 55 L25 49 Z" fill="#b45309" />
          <path d="M94 44 L65 51 L67 55 L95 49 Z" fill="#b45309" />
          {/* Sculpted Hooked Golden Eagle Beak */}
          <path d="M45 74 C49 62 71 62 75 74 C73 88 65 96 60 99 C55 96 47 88 45 74 Z" fill="#f59e0b" />
          <path d="M48 73 C53 65 67 65 72 73 C65 70 55 70 48 73 Z" fill="#fde047" />
          <path d="M49 82 Q60 87 71 82" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "panda":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Round Black Ears */}
          <circle cx="29" cy="25" r="11.5" fill="#1e1b24" />
          <circle cx="91" cy="25" r="11.5" fill="#1e1b24" />
          {/* Outer Fluffy Head Silhouette (Soft Cool Rim for Contrast on Light Tile) */}
          <path
            d="M60 22 L56 18 L54 23 L49 19 L49 25 C33 28 22 42 19 60 L13 67 L19 71 L14 80 L21 83 L19 90 C30 100 44 105 60 105 C76 105 90 100 101 90 L99 83 L106 80 L101 71 L107 67 L101 60 C98 42 87 28 71 25 L71 19 L66 23 L64 18 Z"
            fill="#dce3ec"
          />
          {/* Inner Pure White Face */}
          <path
            d="M60 26 C41 26 26 39 24 60 L19 67 L24 70 L20 78 L26 81 C34 94 46 100 60 100 C74 100 86 94 94 81 L100 78 L96 70 L101 67 L96 60 C94 39 79 26 60 26 Z"
            fill="#ffffff"
          />
          {/* Iconic Tilted Black Panda Eye Patches */}
          <ellipse cx="41.5" cy="60" rx="15" ry="13.5" transform="rotate(-16 41.5 60)" fill="#1e1b24" />
          <ellipse cx="78.5" cy="60" rx="15" ry="13.5" transform="rotate(16 78.5 60)" fill="#1e1b24" />
          {/* Muzzle */}
          <ellipse cx="60" cy="82" rx="16.5" ry="14" fill="#f1f5f9" />
          <KahootEyes leftX={43} rightX={77} y={59} irisColor="#334155" browColor="#334155" browOffsetY={-16} />
          {/* Panda Nose */}
          <path d="M51.5 73 Q60 70 68.5 73 Q66 80 60 81 Q54 80 51.5 73 Z" fill="#1e1b24" />
          <ellipse cx="60" cy="73.2" rx="4.8" ry="1.6" fill="#475569" />
          <path d="M51 88 Q60 92.5 69 88" stroke="#1e1b24" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "owl":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Round Owl Head */}
          <path
            d="M23 54 C21 34 38 25 60 25 C82 25 99 34 97 54 C101 68 98 84 91 92 L87 89 C82 98 72 104 60 104 C48 104 38 98 33 89 L29 92 C22 84 19 68 23 54 Z"
            fill="#c26a1b"
          />
          {/* Forehead Feather Spots */}
          <ellipse cx="60" cy="33" rx="2.5" ry="4.5" fill="#78350f" />
          <ellipse cx="52" cy="35" rx="2" ry="3.8" fill="#78350f" />
          <ellipse cx="68" cy="35" rx="2" ry="3.8" fill="#78350f" />
          {/* Big Golden Eye Rings */}
          <circle cx="42" cy="60" r="16.5" fill="#78350f" />
          <circle cx="78" cy="60" r="16.5" fill="#78350f" />
          <circle cx="42" cy="60" r="13" fill="#fde047" />
          <circle cx="78" cy="60" r="13" fill="#fde047" />
          <circle cx="42" cy="60" r="8.2" fill="#ca8a04" />
          <circle cx="78" cy="60" r="8.2" fill="#ca8a04" />
          <circle cx="42" cy="60" r="5" fill="#1c1917" />
          <circle cx="78" cy="60" r="5" fill="#1c1917" />
          {/* Sweeping Horned Eyebrow Feathers */}
          <path d="M13 38 C24 41 38 45 55 52 L53 56 C36 52 21 47 13 38 Z" fill="#9a4e12" />
          <path d="M107 38 C96 41 82 45 65 52 L67 56 C84 52 99 47 107 38 Z" fill="#9a4e12" />
          {/* Golden Owl Beak */}
          <path d="M44 79 C48 67 72 67 76 79 C75 92 67 100 60 100 C53 100 45 92 44 79 Z" fill="#f59e0b" />
          <path d="M48 79 C52 70 68 70 72 79 C66 75 54 75 48 79 Z" fill="#fbbf24" />
          <path d="M49 87 Q60 91.5 71 87" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "tiger":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Round Tiger Ears */}
          <circle cx="25" cy="39" r="11.5" fill="#f97316" />
          <circle cx="95" cy="39" r="11.5" fill="#f97316" />
          <circle cx="25" cy="39" r="6.5" fill="#431407" />
          <circle cx="95" cy="39" r="6.5" fill="#431407" />
          {/* Head Base */}
          <path
            d="M60 22 L56 17 L53 24 L48 19 L48 26 C32 30 22 44 20 62 L14 69 L20 73 L15 81 L23 84 L20 90 C31 100 45 105 60 105 C75 105 89 100 100 90 L97 84 L105 81 L100 73 L106 69 L100 62 C98 44 88 30 72 26 L72 19 L67 24 L64 17 Z"
            fill="#ff6d1f"
          />
          {/* Warm Cream Cheek & Chin Mask */}
          <path
            d="M23 74 C33 70 43 74 49 81 C54 76 66 76 71 81 C77 74 87 70 97 74 C93 91 78 103 60 103 C42 103 27 91 23 74 Z"
            fill="#fed7aa"
          />
          {/* Clean Geometric Tiger Stripes on Forehead & Outer Cheeks */}
          <path d="M56 26 L60 37 L64 26 Z" fill="#27272a" />
          <path d="M46 29 L51 37 L53 28 Z" fill="#27272a" />
          <path d="M74 29 L69 37 L67 28 Z" fill="#27272a" />
          <path d="M20 60 L32 64 L20 68 Z" fill="#27272a" />
          <path d="M18 71 L30 73 L20 77 Z" fill="#27272a" />
          <path d="M100 60 L88 64 L100 68 Z" fill="#27272a" />
          <path d="M102 71 L90 73 L100 77 Z" fill="#27272a" />
          {/* Muzzle */}
          <ellipse cx="60" cy="83" rx="18" ry="15" fill="#fff7ed" />
          <KahootEyes leftX={43} rightX={77} y={59} irisColor="#7c2d12" socketColor="#ea580c" browColor="#27272a" />
          {/* Nose */}
          <path d="M51.5 74 Q60 71 68.5 74 Q66 81 60 82 Q54 81 51.5 74 Z" fill="#431407" />
          <ellipse cx="60" cy="74.2" rx="4.8" ry="1.6" fill="#7c2d12" />
          <path d="M50 88.5 Q60 93 70 88.5" stroke="#431407" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "lion":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Scalloped Mane */}
          <path
            d="M60 12 C67 12 72 16 76 19 C83 17 90 21 93 27 C100 28 105 35 104 42 C110 47 111 55 107 62 C111 69 109 77 103 82 C104 90 99 97 92 99 C88 105 80 108 73 106 C67 110 53 110 47 106 C40 108 32 105 28 99 C21 97 16 90 17 82 C11 77 9 69 13 62 C9 55 10 47 16 42 C15 35 20 28 27 27 C30 21 37 17 44 19 C48 16 53 12 60 12 Z"
            fill="#b45309"
          />
          {/* Round Ears */}
          <circle cx="29" cy="34" r="9" fill="#f59e0b" />
          <circle cx="91" cy="34" r="9" fill="#f59e0b" />
          <circle cx="29" cy="34" r="5" fill="#92400e" />
          <circle cx="91" cy="34" r="5" fill="#92400e" />
          {/* Face */}
          <path
            d="M27 56 C27 37 41 28 60 28 C79 28 93 37 93 56 C93 78 80 96 60 96 C40 96 27 78 27 56 Z"
            fill="#fbbf24"
          />
          {/* Cream Muzzle */}
          <ellipse cx="52" cy="79" rx="11" ry="9" fill="#fef3c7" />
          <ellipse cx="68" cy="79" rx="11" ry="9" fill="#fef3c7" />
          <ellipse cx="60" cy="86" rx="12" ry="8" fill="#fde68a" />
          <KahootEyes leftX={44} rightX={76} y={57} irisColor="#78350f" socketColor="#d97706" browColor="#78350f" />
          {/* Lion Nose */}
          <path d="M51 71 Q60 68 69 71 L60 79 Z" fill="#7c2d12" />
          <line x1="60" y1="79" x2="60" y2="85" stroke="#78350f" strokeWidth="2.5" />
          <path d="M50 85 Q60 90 70 85" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "raccoon":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Pointed Ears with White Rims */}
          <path d="M22 49 C17 33 19 18 24 13 C32 16 43 24 48 34 Z" fill="#e7dde2" />
          <path d="M98 49 C103 33 101 18 96 13 C88 16 77 24 72 34 Z" fill="#e7dde2" />
          <path d="M25 46 C21 33 22 21 25.5 17 C32 20 40 26 44 34 Z" fill="#46353d" />
          <path d="M95 46 C99 33 98 21 94.5 17 C88 20 80 26 76 34 Z" fill="#46353d" />
          {/* Tufted Head */}
          <path
            d="M60 22 L56 18 L54 24 L49 20 L49 26 C33 30 23 44 20 61 L13 68 L20 72 L13 80 L22 83 L19 90 C31 100 45 105 60 105 C75 105 89 100 101 90 L98 83 L107 80 L100 72 L107 68 L100 61 C97 44 87 30 71 26 L71 20 L66 24 L64 18 Z"
            fill="#59454f"
          />
          {/* Light Brow Band */}
          <path
            d="M25 56 C32 42 46 38 56 44 L60 54 L64 44 C74 38 88 42 95 56 C92 72 80 79 68 74 L60 64 L52 74 C40 79 28 72 25 56 Z"
            fill="#e5d7dc"
          />
          {/* Dark Bandit Eye Patches */}
          <ellipse cx="42.5" cy="60" rx="14" ry="13" fill="#3d2c35" />
          <ellipse cx="77.5" cy="60" rx="14" ry="13" fill="#3d2c35" />
          {/* Cream Muzzle */}
          <ellipse cx="60" cy="84" rx="19" ry="16" fill="#ede2e6" />
          <KahootEyes leftX={43.5} rightX={76.5} y={59.5} irisColor="#46353d" browColor="#46353d" />
          {/* Nose */}
          <ellipse cx="60" cy="76.5" rx="8.5" ry="6.2" fill="#3d2c35" />
          <ellipse cx="60" cy="74.5" rx="5" ry="2" fill="#6e5662" />
          <path d="M51 89 Q60 93.5 69 89" stroke="#46353d" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "bear":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Round Ears */}
          <circle cx="25" cy="37" r="12.5" fill="#9a3412" />
          <circle cx="95" cy="37" r="12.5" fill="#9a3412" />
          <circle cx="25" cy="37" r="7" fill="#fdba74" />
          <circle cx="95" cy="37" r="7" fill="#fdba74" />
          {/* Warm Brown Bear Head */}
          <path
            d="M60 23 L56 18 L54 24 L49 20 L49 26 C33 29 22 42 21 62 C19 84 34 103 60 103 C86 103 101 84 99 62 C98 42 87 29 71 26 L71 20 L66 24 L64 18 Z"
            fill="#b45309"
          />
          {/* Cream Snout Oval */}
          <ellipse cx="60" cy="81" rx="19" ry="15.5" fill="#fde68a" />
          <KahootEyes leftX={43} rightX={77} y={57} irisColor="#451a03" socketColor="#92400e" browColor="#451a03" />
          {/* Bear Nose */}
          <ellipse cx="60" cy="73" rx="9" ry="6.5" fill="#27272a" />
          <ellipse cx="60" cy="71" rx="5" ry="2" fill="#52525b" />
          <line x1="60" y1="79.5" x2="60" y2="87" stroke="#451a03" strokeWidth="2.6" />
          <path d="M49 87 Q60 92 71 87" stroke="#451a03" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );

    case "cat":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Pointed Cat Ears */}
          <path d="M22 50 C17 34 19 20 24 15 C32 18 42 25 47 34 Z" fill="#fb923c" />
          <path d="M98 50 C103 34 101 20 96 15 C88 18 78 25 73 34 Z" fill="#fb923c" />
          <path d="M25 46 C21 35 23 23 26 19 C32 22 39 27 43 34 Z" fill="#fdba74" />
          <path d="M95 46 C99 35 97 23 94 19 C88 22 81 27 77 34 Z" fill="#fdba74" />
          {/* Tufted Ginger Cat Head */}
          <path
            d="M60 24 L56 18 L54 25 L49 20 L49 27 C34 31 24 44 21 61 L13 67 L20 71 L13 79 L22 82 L18 89 C30 99 44 104 60 104 C76 104 90 99 102 89 L98 82 L107 79 L100 71 L107 67 L99 61 C96 44 86 31 71 27 L71 20 L66 25 L64 18 Z"
            fill="#f97316"
          />
          {/* Cream Muzzle */}
          <ellipse cx="60" cy="84" rx="18" ry="15" fill="#ffedd5" />
          <KahootEyes leftX={43} rightX={77} y={59} irisColor="#15803d" socketColor="#ea580c" browColor="#9a3412" />
          {/* Pink Cat Nose */}
          <path d="M53 74 Q60 72 67 74 L60 81 Z" fill="#fb7185" />
          <line x1="60" y1="81" x2="60" y2="88" stroke="#7c2d12" strokeWidth="2.4" />
          <path d="M50 88 Q60 93 70 88" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" />
          {/* White Whiskers */}
          <line x1="34" y1="77" x2="15" y2="75" stroke="#fff7ed" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="35" y1="82" x2="17" y2="85" stroke="#fff7ed" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="86" y1="77" x2="105" y2="75" stroke="#fff7ed" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="85" y1="82" x2="103" y2="85" stroke="#fff7ed" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );

    case "penguin":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Dark Slate Head with Crown Crest */}
          <path
            d="M60 20 L55 14 L53 23 L47 17 L48 25 C31 30 22 46 22 68 C21 86 35 104 60 104 C85 104 99 86 98 68 C98 46 89 30 72 25 L73 17 L67 23 L65 14 Z"
            fill="#334155"
          />
          {/* Heart-Shaped Face Mask */}
          <path
            d="M28 66 C28 46 42 40 54 51 L60 58 L66 51 C78 40 92 46 92 66 C92 86 79 101 60 101 C41 101 28 86 28 66 Z"
            fill="#e2e8f0"
          />
          {/* Rosy Cheeks */}
          <ellipse cx="35" cy="77" rx="6" ry="3.5" fill="#fda4af" />
          <ellipse cx="85" cy="77" rx="6" ry="3.5" fill="#fda4af" />
          <KahootEyes leftX={44} rightX={76} y={61} irisColor="#0f172a" socketColor="#94a3b8" browColor="#1e293b" />
          {/* Round Golden Penguin Beak */}
          <ellipse cx="60" cy="83" rx="16" ry="13" fill="#f59e0b" />
          <ellipse cx="60" cy="81" rx="14" ry="10.5" fill="#fbbf24" />
          <path d="M48 85 Q60 90 72 85" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "rabbit":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Long Upright Rabbit Ears */}
          <path d="M38 44 C24 27 17 13 22 9 C29 8 41 21 49 39 Z" fill="#a8988c" />
          <path d="M82 44 C96 27 103 13 98 9 C91 8 79 21 71 39 Z" fill="#a8988c" />
          <path d="M40 41 C28 27 22 15 25 12 C30 12 39 23 46 38 Z" fill="#f48fb1" />
          <path d="M80 41 C92 27 98 15 95 12 C90 12 81 23 74 38 Z" fill="#f48fb1" />
          {/* Tufted Bunny Head */}
          <path
            d="M60 32 L57 26 L54 33 L50 28 L50 35 C36 39 27 52 25 69 L18 75 L25 79 L19 86 L27 89 C36 99 47 104 60 104 C73 104 84 99 93 89 L101 86 L95 79 L102 75 L95 69 C93 52 84 39 70 35 L70 28 L66 33 L63 26 Z"
            fill="#a8988c"
          />
          {/* Light Cream Eye Patches & Muzzle */}
          <ellipse cx="45" cy="64" rx="12.5" ry="15" fill="#d6cbc2" />
          <ellipse cx="75" cy="64" rx="12.5" ry="15" fill="#d6cbc2" />
          <ellipse cx="60" cy="86" rx="19" ry="15" fill="#f5f0ec" />
          <KahootEyes leftX={45} rightX={75} y={64} irisColor="#1e3a5f" socketColor="#8c7a6b" browColor="#6b5b50" scleraRadius={9.5} irisRadius={5.6} />
          {/* Pink Nose */}
          <path d="M53 76 Q60 74 67 76 L60 82 Z" fill="#f472b6" />
          <path d="M50 90 Q60 94 70 90" stroke="#6b5b50" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );

    case "koala":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Big Fluffy Koala Ears */}
          <circle cx="22" cy="48" r="16" fill="#64748b" />
          <circle cx="98" cy="48" r="16" fill="#64748b" />
          <circle cx="22" cy="48" r="10" fill="#cbd5e1" />
          <circle cx="98" cy="48" r="10" fill="#cbd5e1" />
          {/* Soft Round Koala Head */}
          <path
            d="M60 24 L56 19 L54 25 L49 21 L49 27 C34 30 24 44 24 64 C24 87 38 103 60 103 C82 103 96 87 96 64 C96 44 86 30 71 27 L71 21 L66 25 L64 19 Z"
            fill="#94a3b8"
          />
          {/* Lighter Lower Cheeks */}
          <ellipse cx="60" cy="84" rx="22" ry="14" fill="#cbd5e1" />
          <KahootEyes leftX={43} rightX={77} y={58} irisColor="#334155" socketColor="#64748b" browColor="#475569" />
          {/* Iconic Large Oval Koala Nose */}
          <ellipse cx="60" cy="73" rx="8.5" ry="12" fill="#1e293b" />
          <ellipse cx="58" cy="68" rx="3" ry="4.5" fill="#475569" />
          <path d="M50 90 Q60 94 70 90" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "pug":
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Floppy Dark Brown Ears */}
          <path d="M32 34 C19 32 13 44 15 62 C18 66 24 58 29 48 Z" fill="#3b1d0e" />
          <path d="M88 34 C101 32 107 44 105 62 C102 66 96 58 91 48 Z" fill="#3b1d0e" />
          {/* Fawn Pug Head */}
          <path
            d="M24 56 C24 36 39 29 60 29 C81 29 96 36 96 56 C98 79 86 102 60 102 C34 102 22 79 24 56 Z"
            fill="#eab676"
          />
          {/* Forehead Wrinkles */}
          <path d="M48 37 Q60 41 72 37" stroke="#c68b49" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M52 42 Q60 45 68 42" stroke="#c68b49" strokeWidth="2.2" strokeLinecap="round" />
          {/* Dark Muzzle Mask */}
          <ellipse cx="60" cy="83" rx="24" ry="17" fill="#4a2816" />
          <KahootEyes leftX={43} rightX={77} y={59} irisColor="#3b1d0e" socketColor="#c68b49" browColor="#4a2816" />
          {/* Pug Nose */}
          <ellipse cx="60" cy="72" rx="8.5" ry="6" fill="#1c0f08" />
          <line x1="60" y1="78" x2="60" y2="87" stroke="#1c0f08" strokeWidth="2.5" />
          <path d="M47 86 Q60 92 73 86" stroke="#1c0f08" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );

    case "dragon":
    default:
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full" fill="none">
          {/* Golden Side Fin Ears */}
          <path d="M27 50 L11 42 L17 53 L10 60 L19 66 L14 74 L29 72 Z" fill="#f59e0b" />
          <path d="M93 50 L109 42 L103 53 L110 60 L101 66 L106 74 L91 72 Z" fill="#f59e0b" />
          {/* Curved Golden Horns */}
          <path d="M36 35 C30 23 31 15 36 12 C41 16 44 24 46 31 Z" fill="#fbbf24" />
          <path d="M84 35 C90 23 89 15 84 12 C79 16 76 24 74 31 Z" fill="#fbbf24" />
          {/* Center Crest */}
          <path d="M55 29 L60 15 L65 29 Z" fill="#0f766e" />
          {/* Turquoise Dragon Head */}
          <path
            d="M29 55 C29 36 42 27 60 27 C78 27 91 36 91 55 C95 71 93 88 83 97 C75 103 68 105 60 105 C52 105 45 103 37 97 C27 88 25 71 29 55 Z"
            fill="#14b8a6"
          />
          {/* Mint Snout */}
          <ellipse cx="60" cy="85" rx="26" ry="17" fill="#5eead4" />
          <KahootEyes leftX={44} rightX={76} y={59} irisColor="#b45309" socketColor="#0d9488" browColor="#115e59" scleraRadius={10} irisRadius={6} />
          {/* Nostrils & Smile */}
          <circle cx="53" cy="76" r="2.4" fill="#115e59" />
          <circle cx="67" cy="76" r="2.4" fill="#115e59" />
          <path d="M48 89 Q60 94.5 72 89" stroke="#115e59" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
  }
}

const SIZE_CLASSES = {
  sm: "w-8 h-8 rounded-xl p-0.5",
  md: "w-11 h-11 rounded-xl p-1",
  lg: "w-14 h-14 rounded-2xl p-1",
  xl: "w-20 h-20 rounded-2xl p-1.5",
  "2xl": "w-28 h-28 rounded-3xl p-2",
};

export interface QuizAvatarProps {
  avatarColor?: string | null;
  nickname?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function QuizAvatar({
  avatarColor,
  nickname = "Player",
  size = "md",
  className = "",
}: QuizAvatarProps) {
  const parsed = parseQuizAvatar(avatarColor, nickname);

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden select-none border border-gray-200/80 shadow-sm ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: parsed.tileBg }}
      title={`${nickname} (${parsed.character.name})`}
    >
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <CharacterSvg characterId={parsed.characterId} />
      </div>
    </div>
  );
}

export interface QuizAvatarPickerProps {
  value: string;
  nickname?: string;
  onChange: (encodedAvatar: string) => void;
  compact?: boolean;
}

export function QuizAvatarPicker({
  value,
  nickname = "Ойыншы",
  onChange,
  compact = false,
}: QuizAvatarPickerProps) {
  const parsed = parseQuizAvatar(value, nickname);

  const handleSelectCharacter = (charId: string) => {
    onChange(encodeQuizAvatar(parsed.color, charId));
  };

  const handleSelectColor = (hex: string) => {
    onChange(encodeQuizAvatar(hex, parsed.characterId));
  };

  const handleRandomize = () => {
    const next = randomQuizAvatar();
    onChange(next.encoded);
  };

  return (
    <div className="space-y-4 text-left">
      {/* Header + Randomize Button */}
      <div className="flex items-center justify-between">
        <div>
          <span className="block text-xs font-bold uppercase tracking-wider text-gray-600">
            Кейіпкерді таңдаңыз
          </span>
          <span className="text-xs font-semibold text-purple-700">
            {parsed.character.name}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRandomize}
          className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
        >
          <span><Icon name="dice" /></span>
          <span>Кездейсоқ</span>
        </button>
      </div>

      {/* Character Grid */}
      <div className={`grid ${compact ? "grid-cols-4 gap-2" : "grid-cols-4 sm:grid-cols-4 gap-2.5"}`}>
        {QUIZ_AVATAR_CHARACTERS.map((char) => {
          const isSelected = parsed.characterId === char.id;
          return (
            <button
              type="button"
              key={char.id}
              onClick={() => handleSelectCharacter(char.id)}
              title={char.name}
              className={`group relative flex flex-col items-center p-1.5 rounded-2xl border-2 transition-all ${
                isSelected
                  ? "border-purple-600 bg-purple-50/80 shadow-md scale-105"
                  : "border-gray-100 bg-white hover:border-purple-200"
              }`}
            >
              <QuizAvatar
                avatarColor={encodeQuizAvatar(parsed.color, char.id)}
                nickname={char.name}
                size={compact ? "md" : "lg"}
                className="group-hover:scale-105 transition-transform"
              />
              {!compact && (
                <span className="mt-1 text-[10px] font-bold text-gray-700 truncate w-full text-center">
                  {char.name.split(" ").pop()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Soft Tile Background Picker */}
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
          Фон реңкі
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {QUIZ_AVATAR_COLORS.map((c) => {
            const isSelected = parsed.color.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                type="button"
                key={c.hex}
                onClick={() => handleSelectColor(c.hex)}
                title={c.name}
                className={`w-7 h-7 rounded-full transition-all border ${
                  isSelected
                    ? "ring-2 ring-offset-2 ring-purple-600 scale-110 border-purple-500"
                    : "border-gray-300 opacity-85 hover:opacity-100 hover:scale-105"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
