"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import MathRender from "@/components/ui/MathRender";
import { createQuiz, addQuizQuestion } from "@/lib/api/quizzes";
import { QuestionType, QuizOption } from "@/types/quiz";
import toast from "react-hot-toast";

interface DraftQuestion {
  id: string; // temporary local id
  question_text: string;
  question_type: QuestionType;
  options: QuizOption[];
  correct_answer: string;
  time_limit_seconds: number;
  points: number;
  explanation: string;
}

const OPTION_COLORS = [
  { bg: "bg-red-500", border: "border-red-200", light: "bg-red-50/50", label: "A" },
  { bg: "bg-blue-500", border: "border-blue-200", light: "bg-blue-50/50", label: "B" },
  { bg: "bg-amber-500", border: "border-amber-200", light: "bg-amber-50/50", label: "C" },
  { bg: "bg-emerald-500", border: "border-emerald-200", light: "bg-emerald-50/50", label: "D" },
];

export default function CreateQuizPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [questions, setQuestions] = useState<DraftQuestion[]>([
    {
      id: "q-1",
      question_text: "",
      question_type: "mcq",
      options: [
        { id: "A", text: "", is_correct: true },
        { id: "B", text: "", is_correct: false },
        { id: "C", text: "", is_correct: false },
        { id: "D", text: "", is_correct: false },
      ],
      correct_answer: "A",
      time_limit_seconds: 30,
      points: 1000,
      explanation: "",
    },
  ]);

  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  const currentQ = questions[activeQuestionIndex];

  const updateCurrentQuestion = (updates: Partial<DraftQuestion>) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[activeQuestionIndex] = { ...copy[activeQuestionIndex], ...updates };
      return copy;
    });
  };

  const handleTypeChange = (newType: QuestionType) => {
    let newOptions: QuizOption[] = [];
    let correct = "A";

    if (newType === "mcq") {
      newOptions = [
        { id: "A", text: "", is_correct: true },
        { id: "B", text: "", is_correct: false },
        { id: "C", text: "", is_correct: false },
        { id: "D", text: "", is_correct: false },
      ];
      correct = "A";
    } else if (newType === "tf") {
      newOptions = [
        { id: "A", text: "Шын (True)", is_correct: true },
        { id: "B", text: "Жалған (False)", is_correct: false },
      ];
      correct = "A";
    } else if (newType === "multi_select") {
      newOptions = [
        { id: "A", text: "", is_correct: true },
        { id: "B", text: "", is_correct: true },
        { id: "C", text: "", is_correct: false },
        { id: "D", text: "", is_correct: false },
      ];
      correct = "A,B";
    } else if (newType === "input") {
      newOptions = [];
      correct = "";
    }

    updateCurrentQuestion({
      question_type: newType,
      options: newOptions,
      correct_answer: correct,
    });
  };

  const updateOptionText = (optId: string, text: string) => {
    if (!currentQ) return;
    const newOptions = currentQ.options.map((opt) =>
      opt.id === optId ? { ...opt, text } : opt
    );
    updateCurrentQuestion({ options: newOptions });
  };

  const setMcqCorrect = (optId: string) => {
    if (!currentQ) return;
    const newOptions = currentQ.options.map((opt) => ({
      ...opt,
      is_correct: opt.id === optId,
    }));
    updateCurrentQuestion({ options: newOptions, correct_answer: optId });
  };

  const toggleMultiSelectCorrect = (optId: string) => {
    if (!currentQ) return;
    const newOptions = currentQ.options.map((opt) =>
      opt.id === optId ? { ...opt, is_correct: !opt.is_correct } : opt
    );
    const correctIds = newOptions.filter((o) => o.is_correct).map((o) => o.id).join(",");
    updateCurrentQuestion({ options: newOptions, correct_answer: correctIds });
  };

  const addNewQuestion = () => {
    const newQ: DraftQuestion = {
      id: `q-${Date.now()}`,
      question_text: "",
      question_type: "mcq",
      options: [
        { id: "A", text: "", is_correct: true },
        { id: "B", text: "", is_correct: false },
        { id: "C", text: "", is_correct: false },
        { id: "D", text: "", is_correct: false },
      ],
      correct_answer: "A",
      time_limit_seconds: 30,
      points: 1000,
      explanation: "",
    };
    setQuestions((prev) => [...prev, newQ]);
    setActiveQuestionIndex(questions.length);
  };

  const duplicateQuestion = (idx: number) => {
    const toDuplicate = questions[idx];
    const duplicated: DraftQuestion = {
      ...toDuplicate,
      id: `q-${Date.now()}`,
      options: toDuplicate.options.map((o) => ({ ...o })),
    };
    const nextList = [...questions];
    nextList.splice(idx + 1, 0, duplicated);
    setQuestions(nextList);
    setActiveQuestionIndex(idx + 1);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) {
      toast.error("Кем дегенде 1 сұрақ болуы керек");
      return;
    }
    const nextList = questions.filter((_, i) => i !== idx);
    setQuestions(nextList);
    if (activeQuestionIndex >= nextList.length) {
      setActiveQuestionIndex(nextList.length - 1);
    }
  };

  const handleSaveQuiz = async () => {
    if (!title.trim()) {
      toast.error("Квиз тақырыбын жазыңыз");
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) {
        toast.error(`${i + 1}-сұрақтың мәтіні бос`);
        setActiveQuestionIndex(i);
        return;
      }
      if (q.question_type === "mcq" || q.question_type === "multi_select") {
        for (const opt of q.options) {
          if (!opt.text.trim()) {
            toast.error(`${i + 1}-сұрақтың "${opt.id}" жауап нұсқасын толтырыңыз`);
            setActiveQuestionIndex(i);
            return;
          }
        }
        if (!q.correct_answer) {
          toast.error(`${i + 1}-сұрақтың дұрыс жауабын белгілеңіз`);
          setActiveQuestionIndex(i);
          return;
        }
      } else if (q.question_type === "input") {
        if (!q.correct_answer.trim()) {
          toast.error(`${i + 1}-сұрақтың дұрыс жауабын жазыңыз`);
          setActiveQuestionIndex(i);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const email = session?.user?.email || undefined;
      const { data: newQuiz, error: quizErr } = await createQuiz(
        {
          title: title.trim(),
          description: description.trim(),
          is_public: isPublic,
        },
        email
      );

      if (quizErr || !newQuiz) {
        toast.error(quizErr || "Квизді сақтау мүмкін болмады");
        setSubmitting(false);
        return;
      }

      // Add questions in order
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const payload: any = {
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer.trim(),
          time_limit_seconds: q.time_limit_seconds,
          points: q.points,
          sort_order: i + 1,
          explanation: q.explanation.trim() || undefined,
        };

        if (q.question_type === "input") {
          payload.accepted_answers = [q.correct_answer.trim()];
        }

        const { error: qErr } = await addQuizQuestion(newQuiz.id, payload, email);
        if (qErr) {
          console.error(`Error saving question ${i + 1}:`, qErr);
        }
      }

      toast.success("Квиз сәтті сақталды!");
      router.push(`/quizzes/${newQuiz.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Қате орын алды");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-pink-50/50 text-gray-900 flex flex-col">
      {/* Top Bar */}
      <header className="h-16 border-b border-purple-100 bg-white/90 backdrop-blur px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/quizzes"
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            title="Квиздерге оралу"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse" />
              Квиз құрастырушы (Quiz Builder)
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveQuiz}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-500/20 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-block animate-spin mr-1">⌛</span>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Сақтау және дайын
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar: Questions list & Global Settings */}
        <aside className="w-full lg:w-80 bg-white/70 backdrop-blur-md border-r border-purple-100 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Quiz metadata */}
          <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm">
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Квиз атауы *
            </label>
            <input
              type="text"
              placeholder="Мысалы: 9-сынып Теңдеулер жарысы"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-sm text-gray-900 transition-all focus:outline-none"
            />

            <label className="text-xs font-bold text-gray-700 block mt-3 mb-1.5">
              Сипаттамасы
            </label>
            <textarea
              placeholder="Қысқаша түсініктеме..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-1.5 text-xs text-gray-900 transition-all focus:outline-none"
            />

            <label className="flex items-center gap-2 mt-3 cursor-pointer text-xs font-semibold text-gray-700 select-none">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300"
              />
              Баршаға ашық (Public)
            </label>
          </div>

          {/* Question cards list */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-600 px-1">
              <span>Сұрақтар ({questions.length})</span>
            </div>

            <div className="space-y-2 max-h-[46vh] lg:max-h-none overflow-y-auto pr-1">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  onClick={() => setActiveQuestionIndex(idx)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between group ${
                    activeQuestionIndex === idx
                      ? "bg-purple-50 border-purple-400 shadow-sm text-purple-950 font-semibold"
                      : "bg-white border-gray-200/80 hover:border-purple-200 text-gray-700 shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span
                      className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                        activeQuestionIndex === idx
                          ? "bg-purple-600 text-white"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-xs truncate max-w-[140px]">
                      {q.question_text || "Жаңа сұрақ..."}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateQuestion(idx);
                      }}
                      title="Көшірмесін жасау"
                      className="p-1 hover:text-purple-600 text-gray-400 rounded hover:bg-purple-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    {questions.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeQuestion(idx);
                        }}
                        title="Өшіру"
                        className="p-1 hover:text-red-600 text-gray-400 rounded hover:bg-red-50"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addNewQuestion}
              className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 text-purple-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Сұрақ қосу
            </button>
          </div>
        </aside>

        {/* Main Editor Canvas */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto max-w-4xl mx-auto w-full">
          {currentQ && (
            <div className="space-y-6">
              {/* Question Control Settings Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-purple-100 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-600">Түрі:</span>
                  <select
                    value={currentQ.question_type}
                    onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                    className="bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-500 focus:bg-white"
                  >
                    <option value="mcq">Таңдаулы тест (MCQ)</option>
                    <option value="tf">Шын не Жалған (True/False)</option>
                    <option value="multi_select">Бірнеше дұрыс жауап</option>
                    <option value="input">Ашық математикалық жауап (Input)</option>
                  </select>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">Уақыт:</span>
                    <select
                      value={currentQ.time_limit_seconds}
                      onChange={(e) => updateCurrentQuestion({ time_limit_seconds: Number(e.target.value) })}
                      className="bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      <option value={10}>10 секунд</option>
                      <option value={15}>15 секунд</option>
                      <option value={20}>20 секунд</option>
                      <option value={30}>30 секунд</option>
                      <option value={45}>45 секунд</option>
                      <option value={60}>60 секунд</option>
                      <option value={90}>90 секунд</option>
                      <option value={120}>2 минут</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">Ұпай:</span>
                    <select
                      value={currentQ.points}
                      onChange={(e) => updateCurrentQuestion({ points: Number(e.target.value) })}
                      className="bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      <option value={600}>600 балл</option>
                      <option value={800}>800 балл</option>
                      <option value={1000}>1000 балл</option>
                      <option value={1200}>1200 балл</option>
                      <option value={1500}>1500 балл</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Question Text Box */}
              <div className="bg-white rounded-2xl p-5 border border-purple-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700">
                    Сұрақ мәтіні (LaTeX формулаларын $...$ ішіне жазуға болады)
                  </label>
                  <span className="text-xs text-purple-600 font-mono font-bold">
                    Сұрақ #{activeQuestionIndex + 1}
                  </span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Мысалы: Теңдеуді шешіңіз: $x^2 - 5x + 6 = 0$. x мәндері қандай?"
                  value={currentQ.question_text}
                  onChange={(e) => updateCurrentQuestion({ question_text: e.target.value })}
                  className="w-full bg-gray-50/70 border border-gray-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl p-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none transition-all"
                />

                {/* Live Preview */}
                {currentQ.question_text && (
                  <div className="mt-3 p-3.5 bg-purple-50/60 rounded-xl border border-purple-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 block mb-1">
                      Алдын ала көрініс (Preview):
                    </span>
                    <div className="text-base text-gray-900 font-medium">
                      <MathRender latex={currentQ.question_text} />
                    </div>
                  </div>
                )}
              </div>

              {/* Answers Grid (Quizizz Style) */}
              {currentQ.question_type === "input" ? (
                /* Numeric / Math Input */
                <div className="bg-white rounded-2xl p-6 border border-purple-100 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-1">
                    Дұрыс математикалық жауапты енгізіңіз
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Оқушының енгізген жауабы Mathbott математикалық қозғалтқышы арқылы тексеріледі (мысалы, 1/2 мен 0.5 екеуі де дұрыс деп қабылданады).
                  </p>
                  <input
                    type="text"
                    placeholder="Мысалы: 2 немесе x+3 немесе 3/4"
                    value={currentQ.correct_answer}
                    onChange={(e) => updateCurrentQuestion({ correct_answer: e.target.value })}
                    className="w-full bg-gray-50 border-2 border-emerald-300 focus:bg-white rounded-xl px-4 py-3 text-lg font-mono text-emerald-700 font-bold focus:outline-none focus:border-emerald-500"
                  />
                  {currentQ.correct_answer && (
                    <div className="mt-3 text-sm text-gray-700 flex items-center gap-2">
                      <span className="font-semibold">Көрінісі:</span>
                      <MathRender latex={currentQ.correct_answer} />
                    </div>
                  )}
                </div>
              ) : (
                /* Choice cards: MCQ / TF / Multi-select */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-600 px-1">
                    <span className="font-bold">
                      {currentQ.question_type === "multi_select"
                        ? "Барлық дұрыс нұсқаларды белгілеңіз:"
                        : "Дұрыс жауапты таңдаңыз:"}
                    </span>
                    <span className="text-[11px] text-emerald-600 font-semibold">
                      Жасыл белгі = Дұрыс жауап
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentQ.options.map((opt, idx) => {
                      const color = OPTION_COLORS[idx % OPTION_COLORS.length];
                      const isCorrect =
                        currentQ.question_type === "multi_select"
                          ? opt.is_correct
                          : currentQ.correct_answer === opt.id;

                      return (
                        <div
                          key={opt.id}
                          className={`relative rounded-2xl border-2 p-4 transition-all flex flex-col justify-between shadow-sm ${
                            isCorrect
                              ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200"
                              : `${color.light} ${color.border} hover:border-gray-300`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span
                              className={`w-7 h-7 rounded-lg text-white font-extrabold text-xs flex items-center justify-center shadow-sm ${color.bg}`}
                            >
                              {opt.id}
                            </span>

                            {currentQ.question_type === "multi_select" ? (
                              <button
                                type="button"
                                onClick={() => toggleMultiSelectCorrect(opt.id)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                                  isCorrect
                                    ? "bg-emerald-600 border-emerald-500 text-white font-bold"
                                    : "border-gray-300 bg-white text-transparent hover:border-gray-400"
                                }`}
                              >
                                ✓
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMcqCorrect(opt.id)}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                  isCorrect
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-gray-300 bg-white hover:border-gray-400"
                                }`}
                              >
                                {isCorrect && <span className="w-2 h-2 rounded-full bg-white" />}
                              </button>
                            )}
                          </div>

                          <textarea
                            rows={2}
                            placeholder={`${opt.id} нұсқасын жазыңыз...`}
                            value={opt.text}
                            onChange={(e) => updateOptionText(opt.id, e.target.value)}
                            className="w-full bg-white border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl p-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none transition-all shadow-sm"
                          />

                          {opt.text && (
                            <div className="mt-2 text-xs text-gray-800 font-medium">
                              <MathRender latex={opt.text} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Explanation Box */}
              <div className="bg-white rounded-2xl p-4 border border-purple-100 shadow-sm">
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Түсіндірме (Оқушылар жауап бергеннен кейін көретін шешім жолы, міндетті емес)
                </label>
                <textarea
                  rows={2}
                  placeholder="Шешімнің қадамдары..."
                  value={currentQ.explanation}
                  onChange={(e) => updateCurrentQuestion({ explanation: e.target.value })}
                  className="w-full bg-gray-50/70 border border-gray-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl p-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all"
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
