import { act, render, screen } from "@testing-library/react";
import { heartbeatPresence, getPresenceWsToken } from "@/lib/api";
import { PresenceProvider, usePresence } from "../PresenceProvider";

jest.mock("next-auth/react", () => ({ useSession: () => ({
  data: { user: { email: "student@example.com" } }, status: "authenticated",
}) }));
jest.mock("@/lib/api", () => ({ heartbeatPresence: jest.fn(), getPresenceWsToken: jest.fn() }));

function Probe() {
  const presence = usePresence();
  return <div>{presence.status}:{presence.users.map(user => user.nickname).join(",")}</div>;
}

it("refreshes shared presence through HTTP and stops polling after unmount", async () => {
  const original = process.env.NEXT_PUBLIC_REALTIME_TRANSPORT;
  process.env.NEXT_PUBLIC_REALTIME_TRANSPORT = "polling";
  jest.useFakeTimers();
  (heartbeatPresence as jest.Mock).mockResolvedValue({ data: {
    type: "presence_snapshot", users: [{ id: 3, nickname: "Әлібек" }],
  }, error: null });
  try {
    const view = render(<PresenceProvider><Probe /></PresenceProvider>);
    await act(async () => {});
    expect(screen.getByText("connected:Әлібек")).toBeInTheDocument();
    expect(heartbeatPresence).toHaveBeenCalledWith("student@example.com");
    expect(getPresenceWsToken).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(25000); });
    expect(heartbeatPresence).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => { jest.advanceTimersByTime(25000); });
    expect(heartbeatPresence).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
    if (original === undefined) delete process.env.NEXT_PUBLIC_REALTIME_TRANSPORT;
    else process.env.NEXT_PUBLIC_REALTIME_TRANSPORT = original;
  }
});
