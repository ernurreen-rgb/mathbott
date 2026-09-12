"use client";
import { FriendRequestItem } from "@/types";

type Props = {
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  handleAcceptRequest: (requestId: number) => Promise<void>;
  requestActions: Set<number>;
  handleDeclineRequest: (requestId: number) => Promise<void>;
  handleCancelRequest: (requestId: number) => Promise<void>;
};

export default function IncomingRequestsPanel({ incomingRequests, outgoingRequests, handleAcceptRequest, requestActions, handleDeclineRequest, handleCancelRequest }: Props) {
  return (
    <>
      {(() => {
        // Проверяем статусы в любом регистре
        const pendingIncoming = incomingRequests.filter(req =>
          req.status?.toLowerCase() === "pending"
        );
        const pendingOutgoing = outgoingRequests.filter(req =>
          req.status?.toLowerCase() === "pending"
        );

        if (pendingIncoming.length === 0) return null;

        return (
          <>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">{"\u0414\u043e\u0441\u049b\u0430 \u04e9\u0442\u0456\u043d\u0456\u0448\u0442\u0435\u0440"}</h3>
            <div className="glass rounded-3xl shadow-xl p-4 border border-white/30 bg-white/90 text-gray-900">
              {/* Входящие заявки */}
              <div className="text-sm font-semibold text-gray-700 mb-2">{"\u041a\u0456\u0440\u0456\u0441"}</div>
              <div className="space-y-2">
                {pendingIncoming.map((req) => (
                  <div key={req.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {req.sender_nickname || "\u041f\u0430\u0439\u0434\u0430\u043b\u0430\u043d\u0443\u0448\u044b"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAcceptRequest(req.id)}
                        disabled={requestActions.has(req.id)}
                        className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-lg hover:shadow-glow transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {requestActions.has(req.id) ? "..." : "\u049a\u0430\u0431\u044b\u043b\u0434\u0430\u0443"}
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(req.id)}
                        disabled={requestActions.has(req.id)}
                        className="px-3 py-1.5 bg-gray-200 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {requestActions.has(req.id) ? "..." : "\u0411\u0430\u0441 \u0442\u0430\u0440\u0442\u0443"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Исходящие заявки (показывать, если есть входящие) */}
              {pendingOutgoing.length > 0 && (
                <>
                  <div className="text-sm font-semibold text-gray-700 mb-2 mt-4">{"\u0416\u0456\u0431\u0435\u0440\u0456\u043b\u0433\u0435\u043d"}</div>
                  <div className="space-y-2">
                    {pendingOutgoing.map((req) => (
                      <div key={req.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {req.receiver_nickname || "\u041f\u0430\u0439\u0434\u0430\u043b\u0430\u043d\u0443\u0448\u044b"}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelRequest(req.id)}
                          disabled={requestActions.has(req.id)}
                          className="px-3 py-1.5 bg-gray-200 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {requestActions.has(req.id) ? "..." : "\u0411\u0430\u0441 \u0442\u0430\u0440\u0442\u0443"}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        );
      })()}
    </>
  );
}
