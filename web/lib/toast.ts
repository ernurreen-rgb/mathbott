import toast from "react-hot-toast";

export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      duration: 3000,
      position: "top-center",
      style: {
        background: "#10b981",
        color: "#fff",
        borderRadius: "8px",
        padding: "12px 16px",
      },
    });
  },
  error: (message: string) => {
    toast.error(message, {
      duration: 4000,
      position: "top-center",
      style: {
        background: "#ef4444",
        color: "#fff",
        borderRadius: "8px",
        padding: "12px 16px",
      },
    });
  },
  warning: (message: string) => {
    toast(message, {
      icon: "⚠️",
      duration: 3000,
      position: "top-center",
      style: {
        background: "#f59e0b",
        color: "#fff",
        borderRadius: "8px",
        padding: "12px 16px",
      },
    });
  },
  info: (message: string) => {
    toast(message, {
      icon: "ℹ️",
      duration: 3000,
      position: "top-center",
      style: {
        background: "#3b82f6",
        color: "#fff",
        borderRadius: "8px",
        padding: "12px 16px",
      },
    });
  },
};

