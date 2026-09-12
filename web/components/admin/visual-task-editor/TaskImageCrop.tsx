"use client";
import { apiPath } from "@/lib/api";
import { LessonTask } from "@/types";
import Image from "next/image";
import { CropPercent, HANDLES } from "./model";

type Props = {
  tempImagePreview: string | null;
  taskData: Partial<LessonTask>;
  removeImage: boolean;
  isEditing: boolean;
  imageWrapperRef: React.RefObject<HTMLDivElement>;
  inlineCropActive: boolean;
  handleStartInlineCrop: (src: string) => void;
  cropImageRef: React.RefObject<HTMLImageElement>;
  inlineCropSrc: string | null;
  cropPercent: CropPercent;
  setDraggingHandle: React.Dispatch<React.SetStateAction<"tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l" | null>>;
  handleCancelInlineCrop: () => void;
  handleApplyInlineCrop: () => Promise<void>;
  inlineCropApplying: boolean;
};

export default function TaskImageCrop({ tempImagePreview, taskData, removeImage, isEditing, imageWrapperRef, inlineCropActive, handleStartInlineCrop, cropImageRef, inlineCropSrc, cropPercent, setDraggingHandle, handleCancelInlineCrop, handleApplyInlineCrop, inlineCropApplying }: Props) {
  return (
    <>
      {(tempImagePreview || (taskData.image_filename && !removeImage)) && (
        <div className="mb-4">
          {isEditing ? (
            <div
              ref={imageWrapperRef}
              className={`relative inline-block rounded-lg border border-gray-200 overflow-hidden ${!inlineCropActive ? "cursor-pointer" : ""}`}
              onClick={(e) => {
                if (inlineCropActive) e.stopPropagation();
                else {
                  const src = tempImagePreview || apiPath(`images/${taskData.image_filename}`);
                  handleStartInlineCrop(src);
                }
              }}
            >
              <Image
                ref={cropImageRef}
                src={tempImagePreview || apiPath(`images/${taskData.image_filename}`)}
                alt="Тапсырма"
                width={1280}
                height={720}
                unoptimized
                className="max-h-64 w-auto block rounded-lg border-0"
                draggable={false}
                style={inlineCropActive ? { pointerEvents: "none" } : undefined}
              />
              {inlineCropActive && inlineCropSrc === (tempImagePreview || apiPath(`images/${taskData.image_filename}`)) && (
                <>
                  <div
                    className="absolute inset-0 bg-black/50"
                    style={{
                      clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${cropPercent.left}% ${cropPercent.top}%, ${cropPercent.left + cropPercent.width}% ${cropPercent.top}%, ${cropPercent.left + cropPercent.width}% ${cropPercent.top + cropPercent.height}%, ${cropPercent.left}% ${cropPercent.top + cropPercent.height}%)`,
                      clipRule: "evenodd",
                    }}
                  />
                  <div
                    className="absolute border-2 border-white pointer-events-none box-border"
                    style={{
                      left: `${cropPercent.left}%`,
                      top: `${cropPercent.top}%`,
                      width: `${cropPercent.width}%`,
                      height: `${cropPercent.height}%`,
                    }}
                  />
                  {HANDLES.map((h) => {
                    let left = cropPercent.left;
                    let top = cropPercent.top;
                    if (h === "t" || h === "b") left = cropPercent.left + cropPercent.width / 2;
                    else if (h === "tr" || h === "r" || h === "br") left = cropPercent.left + cropPercent.width;
                    if (h === "l" || h === "r") top = cropPercent.top + cropPercent.height / 2;
                    else if (h === "bl" || h === "b" || h === "br") top = cropPercent.top + cropPercent.height;
                    return (
                      <div
                        key={h}
                        className="absolute w-4 h-4 bg-white border-2 border-purple-600 rounded-full cursor-move -translate-x-1/2 -translate-y-1/2 z-10"
                        style={{ left: `${left}%`, top: `${top}%` }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingHandle(h);
                        }}
                      />
                    );
                  })}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelInlineCrop();
                      }}
                      className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg"
                    >
                      Болдырмау
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyInlineCrop();
                      }}
                      disabled={inlineCropApplying}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                    >
                      {inlineCropApplying ? "…" : "Қолдану"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Image
              src={tempImagePreview || apiPath(`images/${taskData.image_filename}`)}
              alt="Тапсырма"
              width={1280}
              height={720}
              unoptimized
              className="max-h-64 w-auto rounded-lg border border-gray-200"
            />
          )}
        </div>
      )}
    </>
  );
}
