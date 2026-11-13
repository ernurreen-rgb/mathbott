"use client";

interface SkeletonLoaderProps {
  className?: string;
  variant?: "text" | "card" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function SkeletonLoader({
  className = "",
  variant = "text",
  width,
  height,
  lines = 1,
}: SkeletonLoaderProps) {
  const baseClasses = "animate-pulse bg-gray-200 rounded";
  
  if (variant === "circle") {
    return (
      <div
        className={`${baseClasses} ${className}`}
        style={{
          width: width || height || "40px",
          height: height || width || "40px",
          borderRadius: "50%",
        }}
      />
    );
  }

  if (variant === "rect") {
    return (
      <div
        className={`${baseClasses} ${className}`}
        style={{
          width: width || "100%",
          height: height || "100px",
        }}
      />
    );
  }

  if (variant === "card") {
    return (
      <div className={`${baseClasses} p-4 ${className}`} style={{ width: width || "100%" }}>
        <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-5/6"></div>
      </div>
    );
  }

  // Text variant (default)
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${baseClasses} mb-2 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
          style={{
            height: height || "16px",
            width: i === lines - 1 ? "75%" : width || "100%",
          }}
        />
      ))}
    </div>
  );
}




