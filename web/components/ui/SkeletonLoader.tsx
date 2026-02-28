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

// Pre-built skeleton components
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <SkeletonLoader variant="text" lines={2} className="mb-3" />
      <SkeletonLoader variant="rect" height="120px" className="mb-3" />
      <SkeletonLoader variant="text" width="60%" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <SkeletonLoader variant="circle" width="40px" height="40px" />
          <div className="flex-1">
            <SkeletonLoader variant="text" width="60%" className="mb-2" />
            <SkeletonLoader variant="text" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex space-x-2">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <SkeletonLoader
              key={colIdx}
              variant="text"
              width={`${100 / cols}%`}
              className="mr-2"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

