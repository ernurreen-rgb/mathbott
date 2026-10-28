import { listQuizPlayers, markQuizPlayerLinked, readQuizPlayer, saveQuizPlayer } from "../quiz-player-storage";

const player = { sessionId: 4, participantId: 7, token: "t".repeat(43), nickname: "Guest", avatarColor: "#fff" };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

it("preserves guests after a tab closes and keeps multiple attempts in the same game", () => {
  saveQuizPlayer(player);
  saveQuizPlayer({ ...player, participantId: 8, token: "u".repeat(43) });
  sessionStorage.clear();
  expect(readQuizPlayer(4)?.participantId).toBe(8);
  expect(readQuizPlayer(4, 7)).toEqual(player);
  expect(listQuizPlayers()).toHaveLength(2);
});

it("migrates legacy tab-only players and rejects malformed credentials", () => {
  sessionStorage.setItem("quiz_player_4", JSON.stringify(player));
  expect(readQuizPlayer(4)).toEqual(player);
  sessionStorage.clear();
  expect(readQuizPlayer(4)).toEqual(player);
  localStorage.setItem("quiz_player_9", JSON.stringify({ ...player, sessionId: 9, token: "bad" }));
  expect(readQuizPlayer(9)).toBeNull();
});

it("links archives without replacing the player currently active in another attempt", () => {
  saveQuizPlayer(player);
  saveQuizPlayer({ ...player, participantId: 8 });
  markQuizPlayerLinked(player, "owner@example.com");
  expect(readQuizPlayer(4)?.participantId).toBe(8);
  expect(listQuizPlayers().find((item) => item.participantId === 7)?.accountEmail).toBe("owner@example.com");
});

it("keeps the tab playable when persistent storage is full", () => {
  const actual = Storage.prototype.setItem;
  const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (this === localStorage) throw new Error("Quota exceeded");
    actual.call(this, key, value);
  });
  try {
    expect(saveQuizPlayer(player)).toBe(false);
    expect(readQuizPlayer(4)).toEqual(player);
  } finally { setItem.mockRestore(); }
});
