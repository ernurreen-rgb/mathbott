"use client";
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
          <h3 className="text-xl font-bold mb-2">Приглашение в друзья</h3>
          {inviteLoading && (
            <p className="text-sm text-gray-600">Загружаю приглашение...</p>
          )}
          {!inviteLoading && inviteDetails && (
            <div className="space-y-3">
              {inviteDetails.status === "expired" ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h4 className="text-base font-semibold text-red-900 mb-1">Ссылка истекла</h4>
                      <p className="text-sm text-red-700 mb-2">
                        Эта ссылка для добавления в друзья больше не действительна. Срок действия приглашения истек.
                      </p>
                      <p className="text-sm text-red-600 font-medium">
                        Попросите пользователя <span className="font-semibold">{inviteDetails.inviter.nickname || "Пайдаланушы"}</span> отправить вам новую ссылку.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">От:</span>{" "}
                    {inviteDetails.inviter.nickname || "Пайдаланушы"}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Статус:</span>{" "}
                    {inviteDetails.status === "active"
                      ? "Активно"
                      : inviteDetails.status === "accepted"
                        ? "Уже использовано"
                        : inviteDetails.status === "revoked"
                          ? "Отозвано"
                          : "Истекло"}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Действует до:</span>{" "}
                    {formatInviteDate(inviteDetails.expires_at)}
                  </div>
                  {inviteDetails.status === "active" && (
                    <>
                      {inviteDetails.inviter.id === userData?.id && showOwnInviteWarning ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-sm text-yellow-800">
                            Это ваше собственное приглашение. Вы не можете принять его сами. Поделитесь этой ссылкой с другом, чтобы добавить его в друзья.
                          </p>
                        </div>
                      ) : inviteDetails.inviter.id !== userData?.id ? (
                        <button
                          onClick={handleAcceptInvite}
                          disabled={!inviteDetails.can_accept || inviteLoading}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-glow transition-all disabled:opacity-50"
                        >
                          Подтвердить дружбу
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
