"use client";
import Icon from "@/components/ui/Icon";

import { UserData } from "@/types";
import nextDynamic from "next/dynamic";
import type { Dispatch, SetStateAction } from "react";

const QRCode = nextDynamic(() => import("react-qr-code"), {
  ssr: false,
});

type Props = {
  showInviteModal: boolean;
  inviteLink: string | null;
  setShowInviteModal: Dispatch<SetStateAction<boolean>>;
  userData: UserData | null;
  handleShareInvite: () => Promise<void>;
  handleCopyInvite: () => Promise<void>;
  inviteActionMessage: string | null;
};

export default function InviteDialog({ showInviteModal, inviteLink, setShowInviteModal, userData, handleShareInvite, handleCopyInvite, inviteActionMessage }: Props) {
  return (
    <>
      {showInviteModal && inviteLink && (
        <div
          className="fixed top-0 left-0 md:left-64 right-0 bottom-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{userData?.nickname || "Пайдаланушы"}</h3>
              </div>
              <button aria-label="Терезені жабу"
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Icon name="close" className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-gray-100 rounded-xl p-8 flex items-center justify-center mb-6">
              <div className="bg-white p-4 rounded-lg">
                <QRCode
                  value={inviteLink}
                  size={192}
                  level="H"
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleShareInvite}
                className="flex-1 flex flex-col items-center justify-center py-4 px-6 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <Icon name="share" className="w-6 h-6 text-gray-700 mb-2" />
                <span className="text-sm font-semibold text-gray-700">Поделиться</span>
              </button>
              <button
                onClick={handleCopyInvite}
                className="flex-1 flex flex-col items-center justify-center py-4 px-6 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <Icon name="copy" className="w-6 h-6 text-gray-700 mb-2" />
                <span className="text-sm font-semibold text-gray-700">Скопировать</span>
              </button>
            </div>

            {inviteActionMessage && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 animate-fade-in">
                <Icon name="check" className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-green-700">{inviteActionMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
