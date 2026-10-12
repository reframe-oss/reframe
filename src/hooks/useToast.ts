"use client";

import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "loading";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Auto-dismiss delay in ms. Pass `Infinity` to persist until manually dismissed. Defaults to 5000. */
  duration?: number;
}

type ToastInput = Omit<Toast, "id">;

let counter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((input: ToastInput): string => {
    const id = `toast-${++counter}`;
    setToasts((prev) => [...prev, { ...input, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  /** Replace a toast (e.g. swap a loading toast for a success/error one). */
  const updateToast = useCallback((id: string, input: Partial<ToastInput>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...input } : t))
    );
  }, []);

  return { toasts, addToast, dismissToast, dismissAll, updateToast };
}
