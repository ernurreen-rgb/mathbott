import {
  getQuizzes,
  getQuiz,
  getQuizQuestions,
  createQuiz,
  createQuizSession,
  joinQuizSession,
  submitQuizAnswer,
  finishQuizSession,
  getQuizLeaderboard,
  updateQuiz,
} from "../api/quizzes";

global.fetch = jest.fn();

describe("Quizzes API Client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it("fetches quizzes list with correct query parameters", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify([{ id: 1, title: "Тест 1" }]),
    });

    const res = await getQuizzes(true, "user@test.kz");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(callUrl).toContain("my_only=true");
    expect(callUrl).toContain("email=user%40test.kz");
    expect(res.data).toEqual([{ id: 1, title: "Тест 1" }]);
  });

  it("fetches quizzes with is_public parameter and updates quiz privacy", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify([{ id: 2, title: "Private Quiz", is_public: false }]),
    });

    const res = await getQuizzes(true, "user@test.kz", false);
    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(callUrl).toContain("is_public=false");
    expect(res.data?.[0]?.is_public).toBe(false);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: 2, title: "Private Quiz", is_public: true }),
    });

    const updateRes = await updateQuiz(2, { is_public: true }, "user@test.kz");
    const updateUrl = (global.fetch as jest.Mock).mock.calls[1][0];
    const updateOpts = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(updateUrl).toContain("quizzes/2?email=user%40test.kz");
    expect(updateOpts.method).toBe("PUT");
    expect(JSON.parse(updateOpts.body)).toEqual({ is_public: true });
    expect(updateRes.data?.is_public).toBe(true);
  });

  it("fetches single quiz and its questions", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: 5, title: "Алгебра" }),
    });

    const quizRes = await getQuiz(5);
    expect(quizRes.data?.title).toBe("Алгебра");

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify([{ id: 10, question_text: "2+2=?" }]),
    });

    const questionsRes = await getQuizQuestions(5);
    expect(questionsRes.data?.length).toBe(1);
  });

  it("creates quiz session and student joins", async () => {
    // create session
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: 1, pin_code: "123456", status: "lobby" }),
    });

    const sessionRes = await createQuizSession(5, {}, "teacher@test.kz");
    expect(sessionRes.data?.pin_code).toBe("123456");

    // student joins
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          session: { id: 1, pin_code: "123456" },
          participant: { id: 42, nickname: "Айдар", score: 0 },
        }),
    });

    const joinRes = await joinQuizSession("123456", "Айдар");
    expect(joinRes.data?.participant.nickname).toBe("Айдар");
  });

  it("submits quiz answer and fetches leaderboard", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          is_correct: true,
          points_awarded: 950,
          streak: 1,
          total_score: 950,
        }),
    });

    const ansRes = await submitQuizAnswer(1, {
      participant_id: 42,
      question_id: 10,
      answer: "A",
      time_taken_seconds: 5,
    });
    expect(ansRes.data?.is_correct).toBe(true);
    expect(ansRes.data?.points_awarded).toBe(950);

    // leaderboard
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify([{ id: 42, nickname: "Айдар", score: 950 }]),
    });

    const lbRes = await getQuizLeaderboard(1);
    expect(lbRes.data?.[0].score).toBe(950);
  });
});
