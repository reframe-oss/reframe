import Link from "next/link";

import {Film} from 'lucide-react'
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center animate-fade-in">
            <div className="flex items-center gap-2 ">
     <Film size={28} />
         <span className="font-display text-2xl">REFRAME</span>
       </div>
      <span className="font-display text-[clamp(7rem,22vw,16rem)] leading-none text-film-500 select-none">
        404
      </span>

      <div className="w-14 h-px bg-film-500 mt-1 mb-6" />

      <h1 className="font-heading text-xs font-semibold text-[var(--text)] mb-2">
        Frame not found
      </h1>

      <p className="font-sans text-sm text-[var(--muted)] max-w-[22rem] mb-8">
        This reel is empty. The page you&apos;re looking for doesn&apos;t exist.
      </p>

      <Link
        href="/"
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-2xs font-semibold text-[var(--muted)] hover:text-film-500 hover:border-film-400 transition-colors duration-fast shadow-sm"
      >
        ← Back to Reframe
      </Link>
    </div>
  )
}

