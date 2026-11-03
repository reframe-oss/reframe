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
    // Maps onto the shared .btn classes in globals.css so every button in the
    // app has the same shape, states and transitions.
    const variants = {
      primary: "btn-primary",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      outline: "btn-secondary bg-transparent",
    };

    const sizes = {
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
      xl: "btn-lg w-full text-base",
    };

    return (
      <Component
        ref={ref}
        aria-pressed={active}
        className={cn(
          "btn",
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
