"use client";

import { useState, useCallback, useEffect } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
import { createCroppedImageFile } from "@/lib/imageCrop";

interface ImageCropperModalProps {
  imageFile: File;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export default function ImageCropperModal({
  imageFile,
  onConfirm,
  onCancel,
}: ImageCropperModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Create object URL for the image
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      // If no crop area set, use the full image
      onConfirm(imageFile);
      return;
    }

    setIsProcessing(true);
    try {
      const croppedFile = await createCroppedImageFile(
        imageSrc,
        {
          x: croppedAreaPixels.x,
          y: croppedAreaPixels.y,
          width: croppedAreaPixels.width,
          height: croppedAreaPixels.height,
        },
        0
      );
      onConfirm(croppedFile);
    } catch (error) {
      console.error("Error cropping image:", error);
      // Fallback to original file if cropping fails
      onConfirm(imageFile);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Суретті өңдеу</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            disabled={isProcessing}
          >
            ×
          </button>
        </div>

        {/* Cropper area */}
        <div className="flex-1 relative bg-gray-100 min-h-[400px] max-h-[60vh]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            minZoom={1}
            maxZoom={1}
            zoomWithScroll={false}
            onCropComplete={onCropComplete}
            cropShape="rect"
            showGrid={true}
            style={{
              containerStyle: {
                width: "100%",
                height: "100%",
              },
            }}
          />
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-gray-200 space-y-4">
          {/* Instructions */}
          <div className="text-sm text-gray-600">
            <p>• Суретті тартып жылжытыңыз</p>
            <p>• Кесілген аймақ сақталады</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold rounded-lg disabled:opacity-50"
            >
              Болдырмау
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {isProcessing ? "Өңделуде..." : "Сақтау"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
