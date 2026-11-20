/**
 * Helper function to create a cropped image File from an image source and crop area.
 * Uses HTML5 Canvas API to render the cropped image.
 */

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}


/**
 * Creates a cropped image File from the source image and crop parameters.
 * @param imageSrc - The source image (URL string or File)
 * @param pixelCrop - The crop area in pixels
 * @param rotation - Optional rotation angle in degrees (default: 0)
 * @returns Promise that resolves to a File object containing the cropped image
 */
export async function createCroppedImageFile(
  imageSrc: string | File,
  pixelCrop: CropArea,
  rotation: number = 0
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  const cropWidth = Math.max(1, Math.round(pixelCrop.width));
  const cropHeight = Math.max(1, Math.round(pixelCrop.height));
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (normalizedRotation === 0) {
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );
  } else {
    // Rotate the full source image into its rotated bounding box first so
    // pixelCrop coordinates match react-easy-crop's rotated space.
    const rad = (normalizedRotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const bBoxWidth = Math.max(1, Math.round(image.width * cos + image.height * sin));
    const bBoxHeight = Math.max(1, Math.round(image.width * sin + image.height * cos));

    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = bBoxWidth;
    rotatedCanvas.height = bBoxHeight;
    const rotatedCtx = rotatedCanvas.getContext("2d");
    if (!rotatedCtx) {
      throw new Error("Could not get canvas context");
    }
    rotatedCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
    rotatedCtx.rotate(rad);
    rotatedCtx.translate(-image.width / 2, -image.height / 2);
    rotatedCtx.drawImage(image, 0, 0);

    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.drawImage(
      rotatedCanvas,
      pixelCrop.x,
      pixelCrop.y,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );
  }

  // Convert canvas to blob, then to File
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas to blob conversion failed"));
          return;
        }
        const file = new File([blob], `cropped-${Date.now()}.png`, {
          type: "image/png",
        });
        resolve(file);
      },
      "image/png",
      0.95
    );
  });
}

/**
 * Helper to create an Image element from various sources.
 */
function createImage(imageSrc: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => resolve(image);
    image.onerror = reject;

    if (typeof imageSrc === "string") {
      image.src = imageSrc;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        image.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageSrc);
    }
  });
}

