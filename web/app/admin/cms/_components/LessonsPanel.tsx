"use client";
import type { Dispatch, SetStateAction } from "react";
import { Lesson, MiniLesson } from "./model";

type Props = {
  selectedSection: number | null;
  createLesson: (e: React.FormEvent) => Promise<void>;
  lessonForm: { lesson_number: number; title: string; sort_order: number; };
  setLessonForm: Dispatch<SetStateAction<{ lesson_number: number; title: string; sort_order: number; }>>;
  lessons: Lesson[];
  selectedLesson: number | null;
  setSelectedLesson: Dispatch<SetStateAction<number | null>>;
  editingLesson: number | null;
  updateLesson: (e: React.FormEvent) => Promise<void>;
  editLessonForm: { lesson_number: number; title: string; sort_order: number; };
  setEditLessonForm: Dispatch<SetStateAction<{ lesson_number: number; title: string; sort_order: number; }>>;
  cancelEditLesson: () => void;
  startEditLesson: (lesson: Lesson) => void;
  deleteLesson: (lessonId: number) => Promise<void>;
  miniLessons: MiniLesson[];
  selectedMiniLesson: number | null;
  setSelectedMiniLesson: Dispatch<SetStateAction<number | null>>;
  updateMiniLessonTitle: (miniLessonId: number, title: string) => Promise<void>;
};

export default function LessonsPanel({
  selectedSection,
  createLesson,
  lessonForm,
  setLessonForm,
  lessons,
  selectedLesson,
  setSelectedLesson,
  editingLesson,
  updateLesson,
  editLessonForm,
  setEditLessonForm,
  cancelEditLesson,
  startEditLesson,
  deleteLesson,
  miniLessons,
  selectedMiniLesson,
  setSelectedMiniLesson,
  updateMiniLessonTitle,
}: Props) {
  return (
    <>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">Сабақтар</h2>

        {!selectedSection ? (
          <div className="text-center py-8 text-gray-500">Бөлімді таңдаңыз</div>
        ) : (
          <>
            <form onSubmit={createLesson} className="glass rounded-xl p-4 border border-white/20">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="number"
                  value={lessonForm.lesson_number}
                  onChange={(e) => setLessonForm({ ...lessonForm, lesson_number: parseInt(e.target.value) || 1 })}
                  className="p-2 rounded border"
                  placeholder="Сабақ нөмірі"
                  required
                />
                <input
                  type="text"
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                  className="p-2 rounded border"
                  placeholder="Атауы (міндетті емес)"
                />
                <input
                  type="number"
                  value={lessonForm.sort_order}
                  onChange={(e) => setLessonForm({ ...lessonForm, sort_order: parseInt(e.target.value) || 0 })}
                  className="p-2 rounded border"
                  placeholder="Қатар"
                />
              </div>
              <button
                type="submit"
                className="w-full mt-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
              >
                Сабақ құру (авто: 4 кіші сабақ)
              </button>
            </form>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {lessons
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order || a.lesson_number - b.lesson_number)
                .map((l) => (
                  <div
                    key={l.id}
                    className={`p-3 rounded border transition-all ${selectedLesson === l.id
                      ? "bg-purple-100 border-purple-500"
                      : "bg-white/50 border-gray-200 hover:border-purple-300"
                      } cursor-pointer`}
                    onClick={() => setSelectedLesson(l.id)}
                  >
                    {editingLesson === l.id ? (
                      <form onSubmit={updateLesson} className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            type="number"
                            value={editLessonForm.lesson_number}
                            onChange={(e) => setEditLessonForm({ ...editLessonForm, lesson_number: parseInt(e.target.value) || 1 })}
                            className="p-2 rounded border text-sm"
                            required
                          />
                          <input
                            type="text"
                            value={editLessonForm.title}
                            onChange={(e) => setEditLessonForm({ ...editLessonForm, title: e.target.value })}
                            className="p-2 rounded border text-sm"
                            placeholder="Название"
                          />
                          <input
                            type="number"
                            value={editLessonForm.sort_order}
                            onChange={(e) => setEditLessonForm({ ...editLessonForm, sort_order: parseInt(e.target.value) || 0 })}
                            className="p-2 rounded border text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditLesson}
                            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                          >
                            ✕
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex justify-between items-center gap-2">
                        <div className="min-w-0">
                          <div className="font-bold truncate">
                            Сабақ {l.lesson_number}{l.title ? `: ${l.title}` : ""}
                          </div>
                          <div className="text-xs text-gray-600">Қатар: {l.sort_order}</div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditLesson(l);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                            title="Өңдеу"
                            type="button"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLesson(l.id);
                            }}
                            className="text-red-600 hover:text-red-800"
                            title="Жою"
                            type="button"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              {lessons.length === 0 && <div className="text-sm text-gray-500">Сабақтар әлі жоқ.</div>}
            </div>

            {selectedLesson && (
              <div className="glass rounded-xl p-4 border border-white/20 space-y-3">
                <div className="font-bold text-gray-800">Кіші сабақтар (4)</div>
                <div className="grid grid-cols-1 gap-2">
                  {miniLessons
                    .slice()
                    .sort((a, b) => a.mini_index - b.mini_index)
                    .map((ml) => (
                      <div
                        key={ml.id}
                        className={`p-3 rounded border ${selectedMiniLesson === ml.id ? "bg-purple-100 border-purple-500" : "bg-white/60 border-gray-200"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            className="w-8 h-8 rounded-full bg-white border border-gray-200 font-bold"
                            onClick={() => setSelectedMiniLesson(ml.id)}
                            type="button"
                            title="Таңдау"
                          >
                            {ml.mini_index}
                          </button>
                          <input
                            defaultValue={ml.title || `Мини-урок ${ml.mini_index}`}
                            className="flex-1 p-2 rounded border text-sm"
                            onBlur={(e) => updateMiniLessonTitle(ml.id, e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
