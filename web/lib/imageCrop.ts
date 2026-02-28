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

export interface CropData {
  x: number;
  y: number;
  zoom: number;
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

  // Set canvas size to match the crop area
  // pixelCrop is already in natural image pixels from react-easy-crop
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Apply rotation if needed
  if (rotation !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  // Draw the cropped portion of the image
  // pixelCrop coordinates are already relative to natural image size
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

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

/**
 * Converts react-easy-crop crop data and container size to pixel crop area.
 * @param crop - Crop data from react-easy-crop (x, y, zoom)
 * @param imageSize - The displayed image size {width, height}
 * @param containerSize - The container size {width, height}
 * @returns Crop area in pixels
 */
export function getCroppedAreaPixels(
  crop: CropData,
  imageSize: { width: number; height: number },
  containerSize: { width: number; height: number }
): CropArea {
  const scale = imageSize.width / containerSize.width;
  const scaledCrop = {
    x: crop.x * scale,
    y: crop.y * scale,
    width: (containerSize.width / crop.zoom) * scale,
    height: (containerSize.height / crop.zoom) * scale,
  };

  return {
    x: Math.max(0, scaledCrop.x),
    y: Math.max(0, scaledCrop.y),
    width: Math.min(imageSize.width, scaledCrop.width),
    height: Math.min(imageSize.height, scaledCrop.height),
  };
}
