"use client";
import { LessonTask } from "@/types";

type Props = {
  isEditing: boolean;
  showBankMetadata: boolean;
  context: "trial-test" | "mini-lesson";
  taskData: Partial<LessonTask>;
  updateTempTask: (updates: Partial<LessonTask>) => void;
  isNewTask: boolean;
  bankTopicInput: string;
  setBankTopicInput: React.Dispatch<React.SetStateAction<string>>;
  appendTopic: (topics: string[], rawTopic: string) => string[];
};

export default function BankMetadataFields({ isEditing, showBankMetadata, context, taskData, updateTempTask, isNewTask, bankTopicInput, setBankTopicInput, appendTopic }: Props) {
  return (
    <>
      {isEditing && showBankMetadata && context === "trial-test" && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-sm font-semibold text-gray-700 mb-2">БАНК параметрлері</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Күрделілік</label>
              <select
                value={(taskData.bank_difficulty || "B") as string}
                onChange={(e) => updateTempTask({ bank_difficulty: e.target.value as any })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                disabled={!isNewTask && !taskData.bank_task_id}
              >
                <option value="A">A (оңай)</option>
                <option value="B">B (орташа)</option>
                <option value="C">C (қиын)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Тақырыптар</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(Array.isArray(taskData.bank_topics) ? taskData.bank_topics : []).map((topic) => (
                  <span key={topic} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs">
                    {topic}
                    <button
                      type="button"
                      onClick={() => {
                        const prevTopics = Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [];
                        updateTempTask({ bank_topics: prevTopics.filter((value) => value.toLowerCase() !== topic.toLowerCase()) });
                      }}
                      className="text-purple-700 hover:text-purple-900 disabled:text-gray-400"
                      disabled={!isNewTask && !taskData.bank_task_id}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={bankTopicInput}
                  onChange={(e) => setBankTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const prevTopics = Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [];
                      updateTempTask({ bank_topics: appendTopic(prevTopics, bankTopicInput) });
                      setBankTopicInput("");
                    }
                  }}
                  placeholder="Тақырып қосу"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={!isNewTask && !taskData.bank_task_id}
                />
                <button
                  type="button"
                  onClick={() => {
                    const prevTopics = Array.isArray(taskData.bank_topics) ? taskData.bank_topics : [];
                    updateTempTask({ bank_topics: appendTopic(prevTopics, bankTopicInput) });
                    setBankTopicInput("");
                  }}
                  className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  disabled={!isNewTask && !taskData.bank_task_id}
                >
                  +
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">Ең көбі 10 тақырып, әрқайсысы 64 таңбаға дейін</div>
            </div>
          </div>
          {!isNewTask && !taskData.bank_task_id && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Бұл ескі тапсырма БАНК-пен байланыспаған. Тегтер өшірулі, БАНК-пен синхрондау орындалмайды.
            </div>
          )}
        </div>
      )}
    </>
  );
}
