import { fireEvent, render, screen } from "@testing-library/react";
import IncomingRequestsPanel from "../_components/IncomingRequestsPanel";
import ProfileHeader from "../_components/ProfileHeader";
import type { FriendRequestItem, UserData } from "@/types";

it("shows only pending requests and disables a request while its action runs", () => {
  const accept = jest.fn();
  const incoming = [{ id: 1, status: "PENDING", sender_nickname: "Pending" }, { id: 2, status: "accepted", sender_nickname: "Accepted" }] as FriendRequestItem[];
  const props = { incomingRequests: incoming, outgoingRequests: [], requestActions: new Set<number>(), handleAcceptRequest: accept, handleDeclineRequest: jest.fn(), handleCancelRequest: jest.fn() };
  const { rerender } = render(<IncomingRequestsPanel {...props} />);
  expect(screen.queryByText("Accepted")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Қабылдау" }));
  expect(accept).toHaveBeenCalledWith(1);
  rerender(<IncomingRequestsPanel {...props} requestActions={new Set([1])} />);
  expect(screen.getAllByRole("button").every(button => (button as HTMLButtonElement).disabled)).toBe(true);
});

it("sends nickname edits through the parent callback", () => {
  const change = jest.fn();
  render(<ProfileHeader userData={{ nickname: "Old" } as UserData} isEditingNickname nickname="Old" setNickname={change} saving={false} handleSaveNickname={jest.fn()} setIsEditingNickname={jest.fn()} setMessage={jest.fn()} message={null} />);
  fireEvent.change(screen.getByDisplayValue("Old"), { target: { value: "New" } });
  expect(change).toHaveBeenCalledWith("New");
});
