"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Loader2, X } from "lucide-react";
import type { Toast } from "@/hooks/useToast";

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.duration !== Infinity) {
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration ?? 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const icons = {
    success: <CheckCircle size={16} className="shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden="true" />,
    error: <XCircle size={16} className="shrink-0 mt-0.5 text-[var(--error,#ef4444)]" aria-hidden="true" />,
    loading: <Loader2 size={16} className="shrink-0 mt-0.5 text-[var(--muted)] animate-spin" aria-hidden="true" />,
  };

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg",
        "bg-[var(--surface)] border-[var(--border)]",
        "animate-toast-in",
        "min-w-[260px] max-w-[360px]",
      )}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm font-heading text-[var(--text)] leading-snug">
        {toast.message}
      </p>
      {toast.duration !== Infinity && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="shrink-0 mt-0.5 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
