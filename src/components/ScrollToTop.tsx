"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className="
        fixed bottom-5 right-5 z-50
        h-12 w-12 rounded-full
        bg-[var(--accent)] text-white shadow-[var(--shadow)]
        flex items-center justify-center
        transition-[background-color,transform] duration-200
        hover:bg-[var(--accent-hover)] hover:scale-110 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg)]
      "
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}
