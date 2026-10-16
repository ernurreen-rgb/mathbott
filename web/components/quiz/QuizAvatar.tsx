"use client";

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
  { name: "Күлгін", hex: "#8b5cf6", bg: "bg-purple-500" },
  { name: "Көк", hex: "#3b82f6", bg: "bg-blue-500" },
  { name: "Қызғылт", hex: "#ec4899", bg: "bg-pink-500" },
  { name: "Сәбіз", hex: "#f97316", bg: "bg-orange-500" },
  { name: "Жасыл", hex: "#10b981", bg: "bg-emerald-500" },
  { name: "Көгілдір", hex: "#06b6d4", bg: "bg-cyan-500" },
  { name: "Алтын", hex: "#f59e0b", bg: "bg-amber-500" },
  { name: "Алқызыл", hex: "#f43f5e", bg: "bg-rose-500" },
];

export const QUIZ_AVATAR_CHARACTERS: QuizAvatarCharacterOption[] = [
  { id: "fox", name: "Алғыр Түлкі", emoji: "🦊" },
  { id: "robot", name: "Кибер Робот", emoji: "🤖" },
  { id: "astro", name: "Ғарышкер", emoji: "👨‍🚀" },
  { id: "owl", name: "Дана Үкі", emoji: "🦉" },
  { id: "cat", name: "Ниндзя Мысық", emoji: "🐱" },
  { id: "dragon", name: "Айдаһар", emoji: "🐉" },
  { id: "panda", name: "Панда", emoji: "🐼" },
  { id: "lion", name: "Арыстан", emoji: "🦁" },
  { id: "wolf", name: "Көкбөрі", emoji: "🐺" },
  { id: "unicorn", name: "Жұлдыз Тұлпар", emoji: "🦄" },
  { id: "alien", name: "Ғарыш Қонағы", emoji: "👾" },
  { id: "wizard", name: "Сиқыршы", emoji: "🧙‍♂️" },
];

const CHARACTER_MAP = new Map(QUIZ_AVATAR_CHARACTERS.map((c) => [c.id, c]));

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
  characterId: string;
  character: QuizAvatarCharacterOption;
  encoded: string;
} {
  const seedStr = String(fallbackSeed || "player");
  const hash = hashSeed(seedStr);

  let color = QUIZ_AVATAR_COLORS[hash % QUIZ_AVATAR_COLORS.length].hex;
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
  return {
    color,
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

function CharacterSvg({ characterId }: { characterId: string }) {
  switch (characterId) {
    case "fox":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Ears */}
          <path d="M12 10L26 24L10 30Z" fill="#ea580c" />
          <path d="M14 14L23 23L13 27Z" fill="#fed7aa" />
          <path d="M52 10L38 24L54 30Z" fill="#ea580c" />
          <path d="M50 14L41 23L51 27Z" fill="#fed7aa" />
          {/* Head */}
          <path d="M10 28C10 18 54 18 54 28C54 44 38 54 32 54C26 54 10 44 10 28Z" fill="#f97316" />
          {/* White Cheeks */}
          <path d="M10 32C18 32 26 42 32 54C20 52 10 42 10 32Z" fill="#fff7ed" />
          <path d="M54 32C46 32 38 42 32 54C44 52 54 42 54 32Z" fill="#fff7ed" />
          {/* Eyes */}
          <circle cx="23" cy="33" r="3.5" fill="#1e293b" />
          <circle cx="24" cy="31.8" r="1.2" fill="#ffffff" />
          <circle cx="41" cy="33" r="3.5" fill="#1e293b" />
          <circle cx="42" cy="31.8" r="1.2" fill="#ffffff" />
          {/* Nose */}
          <ellipse cx="32" cy="46" rx="4" ry="3" fill="#1e293b" />
          <ellipse cx="31" cy="45" rx="1.5" ry="0.8" fill="#ffffff" opacity="0.6" />
        </svg>
      );

    case "robot":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Antenna */}
          <rect x="30" y="9" width="4" height="9" rx="2" fill="#94a3b8" />
          <circle cx="32" cy="8" r="4" fill="#38bdf8" />
          {/* Side Bolts */}
          <rect x="7" y="29" width="5" height="10" rx="2.5" fill="#64748b" />
          <rect x="52" y="29" width="5" height="10" rx="2.5" fill="#64748b" />
          {/* Head */}
          <rect x="12" y="16" width="40" height="36" rx="10" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2" />
          {/* Visor */}
          <rect x="17" y="23" width="30" height="13" rx="6" fill="#0f172a" />
          <circle cx="25" cy="29.5" r="3.5" fill="#38bdf8" />
          <circle cx="39" cy="29.5" r="3.5" fill="#38bdf8" />
          <circle cx="26" cy="28.5" r="1.2" fill="#ffffff" />
          <circle cx="40" cy="28.5" r="1.2" fill="#ffffff" />
          {/* Smile / Speaker Grille */}
          <rect x="22" y="42" width="20" height="5" rx="2.5" fill="#334155" />
          <line x1="27" y1="42" x2="27" y2="47" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="32" y1="42" x2="32" y2="47" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="37" y1="42" x2="37" y2="47" stroke="#94a3b8" strokeWidth="1.5" />
        </svg>
      );

    case "astro":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Helmet Outer */}
          <circle cx="32" cy="33" r="22" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2.5" />
          {/* Ears/Comms */}
          <rect x="7" y="28" width="4" height="10" rx="2" fill="#cbd5e1" />
          <rect x="53" y="28" width="4" height="10" rx="2" fill="#cbd5e1" />
          {/* Space Visor */}
          <rect x="15" y="20" width="34" height="22" rx="11" fill="#0f172a" />
          <rect x="17" y="22" width="30" height="18" rx="9" fill="#1e3a8a" />
          {/* Visor Glare & Stars */}
          <path d="M21 26C24 23 30 23 34 25" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="40" cy="33" r="2" fill="#fde047" />
          <circle cx="25" cy="34" r="1.3" fill="#ffffff" />
          {/* Collar Detail */}
          <rect x="23" y="47" width="18" height="4" rx="2" fill="#ef4444" />
        </svg>
      );

    case "owl":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Ear Tufts */}
          <path d="M14 14L24 20L16 26Z" fill="#78350f" />
          <path d="M50 14L40 20L48 26Z" fill="#78350f" />
          {/* Body/Head */}
          <circle cx="32" cy="35" r="20" fill="#a16207" />
          <ellipse cx="32" cy="42" rx="13" ry="11" fill="#fef3c7" />
          {/* Big Glasses / Eyes */}
          <circle cx="24" cy="31" r="8" fill="#ffffff" stroke="#fbbf24" strokeWidth="2.5" />
          <circle cx="40" cy="31" r="8" fill="#ffffff" stroke="#fbbf24" strokeWidth="2.5" />
          <line x1="31" y1="31" x2="33" y2="31" stroke="#fbbf24" strokeWidth="2.5" />
          <circle cx="24" cy="31" r="4" fill="#1e293b" />
          <circle cx="40" cy="31" r="4" fill="#1e293b" />
          <circle cx="25.2" cy="29.5" r="1.4" fill="#ffffff" />
          <circle cx="41.2" cy="29.5" r="1.4" fill="#ffffff" />
          {/* Beak */}
          <path d="M29 36L35 36L32 42Z" fill="#f59e0b" />
        </svg>
      );

    case "cat":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Ears */}
          <path d="M14 12L27 22L13 28Z" fill="#334155" />
          <path d="M16 15L24 21L15 25Z" fill="#f472b6" />
          <path d="M50 12L37 22L51 28Z" fill="#334155" />
          <path d="M48 15L40 21L49 25Z" fill="#f472b6" />
          {/* Head */}
          <ellipse cx="32" cy="36" rx="20" ry="17" fill="#475569" />
          {/* Ninja Headband */}
          <path d="M13 27C22 24 42 24 51 27L52 32C42 29 22 29 12 32Z" fill="#ef4444" />
          <circle cx="32" cy="28" r="2.5" fill="#fde047" />
          {/* Eyes */}
          <ellipse cx="24" cy="37" rx="3.5" ry="4" fill="#fde047" />
          <ellipse cx="24" cy="37" rx="1.5" ry="3" fill="#0f172a" />
          <ellipse cx="40" cy="37" rx="3.5" ry="4" fill="#fde047" />
          <ellipse cx="40" cy="37" rx="1.5" ry="3" fill="#0f172a" />
          {/* Nose & Mouth */}
          <path d="M30 42L34 42L32 44.5Z" fill="#f472b6" />
          <path d="M28 46Q32 48 36 46" stroke="#e2e8f0" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "dragon":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Golden Horns */}
          <path d="M16 10L24 22L14 23Z" fill="#facc15" />
          <path d="M48 10L40 22L50 23Z" fill="#facc15" />
          {/* Head */}
          <rect x="13" y="19" width="38" height="34" rx="16" fill="#10b981" />
          {/* Snout */}
          <rect x="18" y="35" width="28" height="15" rx="7.5" fill="#34d399" />
          {/* Eyes */}
          <circle cx="24" cy="29" r="3.8" fill="#fef08a" />
          <circle cx="24" cy="29" r="1.8" fill="#0f172a" />
          <circle cx="40" cy="29" r="3.8" fill="#fef08a" />
          <circle cx="40" cy="29" r="1.8" fill="#0f172a" />
          {/* Nostrils & Fangs */}
          <circle cx="27" cy="41" r="2" fill="#065f46" />
          <circle cx="37" cy="41" r="2" fill="#065f46" />
          <path d="M23 48L25 52L27 48Z" fill="#ffffff" />
          <path d="M37 48L39 52L41 48Z" fill="#ffffff" />
        </svg>
      );

    case "panda":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Black Ears */}
          <circle cx="16" cy="17" r="7" fill="#1e293b" />
          <circle cx="48" cy="17" r="7" fill="#1e293b" />
          {/* White Head */}
          <circle cx="32" cy="35" r="20" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.5" />
          {/* Eye Patches */}
          <ellipse cx="23" cy="34" rx="6" ry="7.5" transform="rotate(-15 23 34)" fill="#1e293b" />
          <ellipse cx="41" cy="34" rx="6" ry="7.5" transform="rotate(15 41 34)" fill="#1e293b" />
          {/* Eyes */}
          <circle cx="23.5" cy="33" r="2.5" fill="#ffffff" />
          <circle cx="40.5" cy="33" r="2.5" fill="#ffffff" />
          {/* Blush */}
          <ellipse cx="17" cy="42" rx="3" ry="1.8" fill="#fda4af" />
          <ellipse cx="47" cy="42" rx="3" ry="1.8" fill="#fda4af" />
          {/* Nose & Smile */}
          <ellipse cx="32" cy="41" rx="3.5" ry="2.5" fill="#1e293b" />
          <path d="M28 45Q32 48 36 45" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "lion":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Mane */}
          <circle cx="32" cy="34" r="23" fill="#b45309" />
          <circle cx="16" cy="20" r="6" fill="#d97706" />
          <circle cx="48" cy="20" r="6" fill="#d97706" />
          {/* Crown */}
          <path d="M23 14L27 8L32 13L37 8L41 14Z" fill="#fde047" />
          {/* Face */}
          <circle cx="32" cy="35" r="16" fill="#fbbf24" />
          {/* Eyes */}
          <circle cx="26" cy="32" r="3" fill="#1e293b" />
          <circle cx="38" cy="32" r="3" fill="#1e293b" />
          <circle cx="27" cy="31" r="1" fill="#ffffff" />
          <circle cx="39" cy="31" r="1" fill="#ffffff" />
          {/* Muzzle */}
          <ellipse cx="29" cy="41" rx="4.5" ry="3.5" fill="#fef3c7" />
          <ellipse cx="35" cy="41" rx="4.5" ry="3.5" fill="#fef3c7" />
          <path d="M29 37L35 37L32 41Z" fill="#78350f" />
        </svg>
      );

    case "wolf":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Sharp Ears */}
          <path d="M13 9L26 22L12 28Z" fill="#475569" />
          <path d="M15 13L23 21L14 25Z" fill="#cbd5e1" />
          <path d="M51 9L38 22L52 28Z" fill="#475569" />
          <path d="M49 13L41 21L50 25Z" fill="#cbd5e1" />
          {/* Head */}
          <path d="M11 27C11 17 53 17 53 27C53 43 39 54 32 54C25 54 11 43 11 27Z" fill="#64748b" />
          <path d="M20 35L32 28L44 35L38 52H26Z" fill="#f1f5f9" />
          {/* Cool Sunglasses */}
          <rect x="14" y="27" width="16" height="9" rx="2" fill="#0f172a" />
          <rect x="34" y="27" width="16" height="9" rx="2" fill="#0f172a" />
          <line x1="30" y1="30" x2="34" y2="30" stroke="#0f172a" strokeWidth="3" />
          <line x1="17" y1="29" x2="22" y2="34" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          <line x1="37" y1="29" x2="42" y2="34" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          {/* Nose */}
          <ellipse cx="32" cy="46" rx="4" ry="3" fill="#0f172a" />
        </svg>
      );

    case "unicorn":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Ears */}
          <path d="M15 16L25 23L16 28Z" fill="#f9a8d4" />
          <path d="M49 16L39 23L48 28Z" fill="#f9a8d4" />
          {/* Rainbow Mane */}
          <circle cx="32" cy="20" r="9" fill="#c084fc" />
          {/* Golden Horn */}
          <path d="M28 21L32 6L36 21Z" fill="#fde047" stroke="#eab308" strokeWidth="1" />
          {/* Head */}
          <rect x="15" y="21" width="34" height="32" rx="16" fill="#ffffff" />
          {/* Snout */}
          <ellipse cx="32" cy="44" rx="12" ry="8" fill="#fce7f3" />
          {/* Eyes */}
          <circle cx="24" cy="32" r="3.2" fill="#4c1d95" />
          <circle cx="25" cy="31" r="1.2" fill="#ffffff" />
          <circle cx="40" cy="32" r="3.2" fill="#4c1d95" />
          <circle cx="41" cy="31" r="1.2" fill="#ffffff" />
          {/* Nostrils */}
          <circle cx="28" cy="43" r="1.5" fill="#ec4899" />
          <circle cx="36" cy="43" r="1.5" fill="#ec4899" />
        </svg>
      );

    case "alien":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Twin Antennas */}
          <line x1="22" y1="18" x2="18" y2="10" stroke="#84cc16" strokeWidth="3" strokeLinecap="round" />
          <circle cx="17" cy="9" r="3.5" fill="#bef264" />
          <line x1="42" y1="18" x2="46" y2="10" stroke="#84cc16" strokeWidth="3" strokeLinecap="round" />
          <circle cx="47" cy="9" r="3.5" fill="#bef264" />
          {/* Head */}
          <path d="M12 34C12 19 52 19 52 34C52 47 42 54 32 54C22 54 12 47 12 34Z" fill="#84cc16" />
          {/* Three Eyes */}
          <circle cx="21" cy="33" r="4.5" fill="#ffffff" />
          <circle cx="21" cy="33" r="2.2" fill="#1e293b" />
          <circle cx="32" cy="27" r="4.5" fill="#ffffff" />
          <circle cx="32" cy="27" r="2.2" fill="#1e293b" />
          <circle cx="43" cy="33" r="4.5" fill="#ffffff" />
          <circle cx="43" cy="33" r="2.2" fill="#1e293b" />
          {/* Smile */}
          <path d="M24 44Q32 50 40 44" stroke="#1a2e05" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case "wizard":
    default:
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm" fill="none">
          {/* Face/Shadow under hat */}
          <circle cx="32" cy="39" r="15" fill="#1e1b4b" />
          {/* Glowing Eyes */}
          <ellipse cx="26" cy="39" rx="3.2" ry="2.2" fill="#fde047" />
          <ellipse cx="38" cy="39" rx="3.2" ry="2.2" fill="#fde047" />
          {/* White Beard */}
          <path d="M19 45Q32 58 45 45Q39 55 32 56Q25 55 19 45Z" fill="#e2e8f0" />
          {/* Wizard Hat */}
          <path d="M16 28L32 6L48 28Z" fill="#4f46e5" />
          <ellipse cx="32" cy="28" rx="22" ry="5" fill="#4338ca" />
          {/* Hat Band & Star */}
          <path d="M19 25Q32 28 45 25" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="18" r="2.5" fill="#fde047" />
        </svg>
      );
  }
}

const SIZE_CLASSES = {
  sm: "w-8 h-8 rounded-xl p-1",
  md: "w-10 h-10 rounded-xl p-1",
  lg: "w-12 h-12 rounded-2xl p-1.5",
  xl: "w-16 h-16 rounded-2xl p-2",
  "2xl": "w-24 h-24 rounded-3xl p-2.5",
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
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden select-none shadow-md ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: parsed.color }}
      title={`${nickname} (${parsed.character.name})`}
    >
      {/* Subtle glossy highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black/15 via-transparent to-white/25 pointer-events-none" />
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
            {parsed.character.emoji} {parsed.character.name}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRandomize}
          className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
        >
          <span>🎲</span>
          <span>Кездейсоқ</span>
        </button>
      </div>

      {/* Character Grid */}
      <div className={`grid ${compact ? "grid-cols-6 gap-2" : "grid-cols-4 sm:grid-cols-6 gap-2.5"}`}>
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
                  : "border-gray-100 bg-gray-50/70 hover:border-purple-200 hover:bg-white"
              }`}
            >
              <QuizAvatar
                avatarColor={encodeQuizAvatar(parsed.color, char.id)}
                nickname={char.name}
                size={compact ? "sm" : "md"}
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

      {/* Color Picker */}
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
          Фон түсі
        </span>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {QUIZ_AVATAR_COLORS.map((c) => {
            const isSelected = parsed.color.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                type="button"
                key={c.hex}
                onClick={() => handleSelectColor(c.hex)}
                className={`w-8 h-8 rounded-full ${c.bg} transition-all flex items-center justify-center ${
                  isSelected
                    ? "ring-4 ring-offset-2 ring-purple-600 scale-110 shadow-md"
                    : "opacity-80 hover:opacity-100 hover:scale-105"
                }`}
                title={c.name}
              >
                {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default QuizAvatar;
