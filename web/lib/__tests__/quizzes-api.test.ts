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
  forkQuiz,
  getQuizSessions,
  getQuizSessionFullResults,
  getUserQuizHistory,
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

  it("updates quiz with questions payload", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: 10, title: "Жаңартылған квиз" }),
    });

    const questionsPayload = [
      {
        question_text: "3+3=?",
        question_type: "mcq" as const,
        options: [{ id: "A", text: "6", is_correct: true }],
        correct_answer: "A",
        time_limit_seconds: 30,
        points: 1000,
        sort_order: 1,
      },
    ];

    const res = await updateQuiz(
      10,
      { title: "Жаңартылған квиз", questions: questionsPayload },
      "author@test.kz"
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const updateUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    const updateOpts = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(updateUrl).toContain("quizzes/10?email=author%40test.kz");
    expect(updateOpts.method).toBe("PUT");
    const body = JSON.parse(updateOpts.body);
    expect(body.title).toBe("Жаңартылған квиз");
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].question_text).toBe("3+3=?");
    expect(res.data?.id).toBe(10);
  });

  it("forks a public quiz", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ id: 99, title: "Тест (Көшірме)", can_manage: true }),
    });

    const res = await forkQuiz(5, "newuser@test.kz");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const forkUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    const forkOpts = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(forkUrl).toContain("quizzes/5/fork?email=newuser%40test.kz");
    expect(forkOpts.method).toBe("POST");
    expect(res.data?.id).toBe(99);
    expect(res.data?.can_manage).toBe(true);
  });

  it("fetches quiz sessions and full results", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify([{ id: 1, pin_code: "123456", participant_count: 5 }]),
    });

    const sessionsRes = await getQuizSessions(10, "teacher@test.kz");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("quizzes/10/sessions?email=teacher%40test.kz");
    expect(sessionsRes.data?.[0]?.pin_code).toBe("123456");

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({
        session: { id: 1, pin_code: "123456" },
        participants: [{ id: 10, nickname: "Студент", score: 1000, rank: 1 }],
      }),
    });

    const resultsRes = await getQuizSessionFullResults(1, { email: "teacher@test.kz" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain("quiz-sessions/1/results?email=teacher%40test.kz");
    expect(resultsRes.data?.participants[0]?.nickname).toBe("Студент");
  });

  it("fetches user quiz history", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify([{ quiz_title: "Тест 1", score: 950, rank: 1 }]),
    });

    const res = await getUserQuizHistory("student@test.kz");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("quiz-sessions/user/history?email=student%40test.kz");
    expect(res.data?.[0]?.quiz_title).toBe("Тест 1");
  });
});
