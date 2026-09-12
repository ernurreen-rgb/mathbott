"use client";
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
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
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
                <svg className="w-6 h-6 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">Поделиться</span>
              </button>
              <button
                onClick={handleCopyInvite}
                className="flex-1 flex flex-col items-center justify-center py-4 px-6 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <svg className="w-6 h-6 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">Скопировать</span>
              </button>
            </div>

            {inviteActionMessage && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 animate-fade-in">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-semibold text-green-700">{inviteActionMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
