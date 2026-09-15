"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "xl";
  active?: boolean;
  as?: "button" | "a";
  href?: string;
  download?: string;
  target?: string;
  rel?: string;
}

const BaseButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, BaseButtonProps>(
  ({ className, variant = "secondary", size = "md", active, children, as = "button", ...props }, ref) => {
    const Component = as as any;
    const variants = {
      primary: "bg-film-600 text-white shadow-lg shadow-film-200 dark:shadow-none hover:bg-film-700",
      secondary: active
        ? "border-film-500 bg-film-50 text-film-700 font-heading font-semibold dark:bg-film-900/20 dark:text-film-400 dark:border-film-700"
        : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-film-300 hover:bg-film-50/30 dark:hover:bg-film-900/10",
      ghost: "bg-transparent hover:bg-[var(--surface)]",
      outline: "border border-[var(--border)] bg-transparent hover:border-film-300",
    };

    const sizes = {
      sm: "px-2 py-1 text-[10px]",
      md: "px-3 py-2 text-xs",
      lg: "px-4 py-3 text-sm",
      xl: "py-5 text-2xl tracking-widest font-display",
    };

    return (
      <Component
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg transition-all duration-200",
          "hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:outline-none focus-visible:ring-offset-[var(--bg)]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

BaseButton.displayName = "BaseButton";

export default BaseButton;
