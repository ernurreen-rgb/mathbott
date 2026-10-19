"use client";
import Icon from "@/components/ui/Icon";

import { UserData } from "@/types";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  userData: UserData | null;
  isEditingNickname: boolean;
  handleSaveNickname: (e: React.FormEvent) => Promise<void>;
  nickname: string;
  setNickname: Dispatch<SetStateAction<string>>;
  saving: boolean;
  setIsEditingNickname: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<{ type: "success" | "error"; text: string; } | null>>;
  message: { type: "success" | "error"; text: string; } | null;
};

export default function ProfileHeader({ userData, isEditingNickname, handleSaveNickname, nickname, setNickname, saving, setIsEditingNickname, setMessage, message }: Props) {
  return (
    <>
      <div className="bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 rounded-3xl shadow-2xl p-8 mb-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl font-bold border-4 border-white/30">
              {userData?.nickname?.[0]?.toUpperCase() || userData?.email?.[0]?.toUpperCase() || <><Icon name="user" /></>}
            </div>
            <div className="flex-1">
              {isEditingNickname ? (
                <form onSubmit={handleSaveNickname} className="space-y-3">
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Никнейміңізді енгізіңіз"
                    maxLength={50}
                    className="w-full px-4 py-2 bg-white/90 text-gray-800 rounded-lg border-2 border-white/50 focus:ring-2 focus:ring-white focus:border-white transition-all outline-none text-xl font-bold"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      aria-label="Никнеймді сақтау"
                      disabled={saving || !nickname.trim() || nickname.trim() === (userData?.nickname || "")}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                    >
                      {saving ? "..." : <><Icon name="check" /></>}
                    </button>
                    <button
                      type="button"
                      aria-label="Өңдеуден бас тарту"
                      onClick={() => {
                        setIsEditingNickname(false);
                        setNickname(userData?.nickname || "");
                        setMessage(null);
                      }}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all font-semibold"
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  {message && (
                    <div
                      className={`text-sm px-3 py-2 rounded-lg ${message.type === "success"
                          ? "bg-green-500/30 text-green-100"
                          : "bg-red-500/30 text-red-100"
                        }`}
                    >
                      {message.text}
                    </div>
                  )}
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  <h2 className="text-3xl font-bold mb-1">
                    {userData?.nickname || userData?.email || "Пайдаланушы"}
                  </h2>
                  <button
                    onClick={() => {
                      setIsEditingNickname(true);
                      setNickname(userData?.nickname || "");
                      setMessage(null);
                    }}
                    className="inline-flex items-center justify-center w-9 h-9 bg-white/20 hover:bg-white/30 rounded-lg transition-all backdrop-blur-sm"
                    title="Никнеймді өзгерту"
                  >
                    <Icon name="edit" className="w-5 h-5 text-white" />
                  </button>
                </div>
              )}
              <p className="text-blue-100 text-sm">{userData?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
