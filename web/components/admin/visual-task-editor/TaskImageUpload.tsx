"use client";
import { LessonTask } from "@/types";

type Props = {
  isEditing: boolean;
  tempImagePreview: string | null;
  taskData: Partial<LessonTask>;
  removeImage: boolean;
  tempImageFile: File | null;
  setTempImageFile: React.Dispatch<React.SetStateAction<File | null>>;
  setRemoveImage: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function TaskImageUpload({ isEditing, tempImagePreview, taskData, removeImage, tempImageFile, setTempImageFile, setRemoveImage, setIsDirty }: Props) {
  return (
    <>
      {isEditing && (
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Сурет</label>
          {(tempImagePreview || taskData.image_filename || removeImage) && (
            <div className="mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">
                {removeImage
                  ? "Сақтаған кезде сурет жойылады"
                  : tempImageFile
                    ? "Жаңа сурет (сақталады)"
                    : taskData.image_filename
                      ? `Ағымдағы: ${taskData.image_filename}`
                      : null}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file) {
                    setTempImageFile(file);
                    setRemoveImage(false);
                    setIsDirty(true);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
              <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold transition-colors">
                {removeImage ? "Сурет қосу" : tempImageFile || taskData.image_filename ? "Суретті ауыстыру" : "Сурет қосу"}
              </div>
            </label>
            {removeImage ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRemoveImage(false);
                  setIsDirty(true);
                }}
                className="shrink-0 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors cursor-pointer select-none"
              >
                Жоюды болдырмау
              </button>
            ) : (tempImageFile || taskData.image_filename) ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTempImageFile(null);
                  setRemoveImage(true);
                  setIsDirty(true);
                }}
                className="shrink-0 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors cursor-pointer select-none"
              >
                Жою
              </button>
            ) : null}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            💡 Суретті Ctrl+V арқылы да қоюға болады
          </div>
        </div>
      )}
    </>
  );
}
