"use client";
import type { Dispatch, SetStateAction } from "react";
import { MiniLesson, MiniLessonTask, Section } from "./model";

type Props = {
  selectedModule: number | null;
  createSection: (e: React.FormEvent) => Promise<void>;
  sectionForm: { name: string; description: string; sort_order: number; };
  setSectionForm: Dispatch<SetStateAction<{ name: string; description: string; sort_order: number; }>>;
  sections: Section[];
  selectedSection: number | null;
  editingSection: number | null;
  setSelectedSection: Dispatch<SetStateAction<number | null>>;
  setSelectedLesson: Dispatch<SetStateAction<number | null>>;
  setMiniLessons: Dispatch<SetStateAction<MiniLesson[]>>;
  setSelectedMiniLesson: Dispatch<SetStateAction<number | null>>;
  setMiniTasks: Dispatch<SetStateAction<MiniLessonTask[]>>;
  updateSection: (e: React.FormEvent) => Promise<void>;
  editSectionForm: { name: string; description: string; sort_order: number; };
  setEditSectionForm: Dispatch<SetStateAction<{ name: string; description: string; sort_order: number; }>>;
  cancelEditSection: () => void;
  startEditSection: (section: Section) => void;
  deleteSection: (id: number) => Promise<void>;
};

export default function SectionsPanel({
  selectedModule,
  createSection,
  sectionForm,
  setSectionForm,
  sections,
  selectedSection,
  editingSection,
  setSelectedSection,
  setSelectedLesson,
  setMiniLessons,
  setSelectedMiniLesson,
  setMiniTasks,
  updateSection,
  editSectionForm,
  setEditSectionForm,
  cancelEditSection,
  startEditSection,
  deleteSection,
}: Props) {
  return (
    <>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">Бөлімдер</h2>

        {selectedModule ? (
          <>
            <form onSubmit={createSection} className="glass rounded-xl p-4 border border-white/20 space-y-2">
              <input
                type="text"
                placeholder="Бөлім атауы"
                value={sectionForm.name}
                onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                className="w-full p-2 rounded border"
                required
              />
              <input
                type="text"
                placeholder="Қысқаша сипаттама (мысалы: бөлім не туралы)"
                value={sectionForm.description}
                onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                className="w-full p-2 rounded border text-sm"
              />
              <input
                type="number"
                placeholder="Сұрыптау тәртібі"
                value={sectionForm.sort_order}
                onChange={(e) => setSectionForm({ ...sectionForm, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full p-2 rounded border"
                required
              />
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
              >
                Бөлім құру
              </button>
            </form>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className={`p-3 rounded border transition-all ${selectedSection === section.id
                    ? "bg-purple-100 border-purple-500"
                    : "bg-white/50 border-gray-200 hover:border-purple-300"
                    } ${editingSection === section.id ? "" : "cursor-pointer"}`}
                  onClick={() => {
                    if (editingSection !== section.id) {
                      setSelectedSection(section.id);
                      setSelectedLesson(null);
                      setMiniLessons([]);
                      setSelectedMiniLesson(null);
                      setMiniTasks([]);
                    }
                  }}
                >
                  {editingSection === section.id ? (
                    <form onSubmit={updateSection} className="space-y-2">
                      <input
                        type="text"
                        value={editSectionForm.name}
                        onChange={(e) => setEditSectionForm({ ...editSectionForm, name: e.target.value })}
                        className="w-full p-2 rounded border text-sm"
                        placeholder="Бөлім атауы"
                        required
                        onClick={(e) => e.stopPropagation()}
                      />
                      <textarea
                        value={editSectionForm.description}
                        onChange={(e) =>
                          setEditSectionForm({ ...editSectionForm, description: e.target.value })
                        }
                        className="w-full p-2 rounded border text-xs"
                        placeholder="Қысқаша сипаттама"
                        rows={2}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <input
                        type="number"
                        value={editSectionForm.sort_order}
                        onChange={(e) =>
                          setEditSectionForm({
                            ...editSectionForm,
                            sort_order: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full p-2 rounded border text-sm"
                        placeholder="Қатар"
                        required
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditSection();
                          }}
                          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                        >
                          ✕
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="min-w-0">
                        <div className="font-bold">{section.name}</div>
                        {section.description && (
                          <div className="text-xs text-gray-600 truncate max-w-[220px]">
                            {section.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-0.5">Қатар: {section.sort_order}</div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditSection(section);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Өңдеу"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSection(section.id);
                          }}
                          className="text-red-600 hover:text-red-800"
                          title="Жою"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Бөлімдерді басқару үшін модульді таңдаңыз
          </div>
        )}
      </div>
    </>
  );
}
