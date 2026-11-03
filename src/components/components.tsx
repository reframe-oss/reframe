import { type ReactNode } from "react";

interface CardProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Reusable Card component.
 */
export function Card({ title, description, children, className = "" }: CardProps) {
  return (
    <div
      className={`
        rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]
        ${className}
      `}
    >
      <h2 className="text-xl font-semibold text-[var(--text)]">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-[var(--muted)]">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/**
 * Primary Button — demonstrates interactive dark mode states.
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  const variants = {
    primary: `
      bg-[var(--accent)]
      text-[var(--on-accent)]
      hover:bg-[var(--accent-hover)]
      focus:ring-[var(--accent)]
    `,
    secondary: `
      bg-[var(--accent-muted)]
      text-[var(--text)]
      border border-[var(--accent)]
      hover:bg-[var(--surface)]
      focus:ring-[var(--accent)]
    `,
    ghost: `
      bg-transparent
      text-[var(--muted)]
      hover:bg-[var(--accent-muted)] hover:text-[var(--text)]
      focus:ring-[var(--accent)]
    `,
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        rounded-[var(--radius)] px-4 py-2 text-sm font-medium
        focus:outline-none focus:ring-2 focus:ring-offset-2
        focus:ring-offset-[var(--bg)]
        transition-colors duration-fast
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Input — demonstrates form field dark mode variants.
 */
export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`
        w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]
        placeholder:text-[var(--muted)]
        focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]
        transition-colors duration-fast
        ${className}
      `}
      {...props}
    />
  );
}

/**
 * Badge — subtle label with dark support.
 */
interface BadgeProps {
  label: string;
  variant?: "default" | "success" | "warning" | "error";
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  const variants = {
    default: "bg-[var(--accent-muted)] text-[var(--text)]",
    success: "bg-[var(--accent-muted)] text-[var(--text)]",
    warning: "bg-[var(--accent-muted)] text-[var(--text)]",
    error: "bg-[var(--error-bg)] text-[var(--error)]",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {label}
    </span>
  );
}
