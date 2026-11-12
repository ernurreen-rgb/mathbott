"use client";
import Icon from "@/components/ui/Icon";

import { FriendInviteDetails, UserData } from "@/types";

type Props = {
  inviteToken: string | null;
  inviteLoading: boolean;
  inviteDetails: FriendInviteDetails | null;
  formatInviteDate: (value?: string | null) => string;
  userData: UserData | null;
  showOwnInviteWarning: boolean;
  handleAcceptInvite: () => Promise<void>;
  inviteActionMessage: string | null;
};

export default function AcceptInvitePanel({ inviteToken, inviteLoading, inviteDetails, formatInviteDate, userData, showOwnInviteWarning, handleAcceptInvite, inviteActionMessage }: Props) {
  return (
    <>
      {inviteToken && (
        <div className="glass rounded-3xl shadow-xl p-6 border border-white/30">
          <h3 className="text-xl font-bold mb-2">Достыққа шақыру</h3>
          {inviteLoading && (
            <p className="text-sm text-gray-600">Шақыру жүктелуде...</p>
          )}
          {!inviteLoading && inviteDetails && (
            <div className="space-y-3">
              {inviteDetails.status === "expired" ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Icon name="alert" className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-base font-semibold text-red-900 mb-1">Сілтеменің мерзімі өтіп кетті</h4>
                      <p className="text-sm text-red-700 mb-2">
                        Достарға қосуға арналған бұл сілтеме енді жарамсыз. Шақырудың жарамдылық мерзімі аяқталды.
                      </p>
                      <p className="text-sm text-red-600 font-medium">
                        <span className="font-semibold">{inviteDetails.inviter.nickname || "Пайдаланушы"}</span> пайдаланушысынан сізге жаңа сілтеме жіберуін сұраңыз.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Кімнен:</span>{" "}
                    {inviteDetails.inviter.nickname || "Пайдаланушы"}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Күйі:</span>{" "}
                    {inviteDetails.status === "active"
                      ? "Белсенді"
                      : inviteDetails.status === "accepted"
                        ? "Қолданылған"
                        : inviteDetails.status === "revoked"
                          ? "Қайтарып алынған"
                          : "Мерзімі өткен"}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Жарамдылық мерзімі:</span>{" "}
                    {formatInviteDate(inviteDetails.expires_at)}
                  </div>
                  {inviteDetails.status === "active" && (
                    <>
                      {inviteDetails.inviter.id === userData?.id && showOwnInviteWarning ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-sm text-yellow-800">
                            Бұл сіздің өз шақыруыңыз. Оны өзіңіз қабылдай алмайсыз. Досыңызды қосу үшін осы сілтемені онымен бөлісіңіз.
                          </p>
                        </div>
                      ) : inviteDetails.inviter.id !== userData?.id ? (
                        <button
                          onClick={handleAcceptInvite}
                          disabled={!inviteDetails.can_accept || inviteLoading}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-glow transition-all disabled:opacity-50"
                        >
                          Достықты растау
                        </button>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {inviteActionMessage && (
            <div className="mt-3 text-sm text-gray-700">{inviteActionMessage}</div>
          )}
        </div>
      )}
    </>
  );
}
