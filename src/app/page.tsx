import VideoEditor from "@/components/VideoEditor";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <a
        href="https://github.com/reframe-oss/reframe"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View Reframe on GitHub"
        className="hidden sm:flex fixed top-4 right-4 md:right-16 z-50 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[10px] font-heading font-semibold uppercase tracking-wider transition-all duration-200 ease-in-out hover:scale-105 hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] hover:shadow-[var(--shadow)]"
      >
        ⭐ Star on GitHub
      </a>

      <main id="main-content" tabIndex={-1}>
        <VideoEditor />
      </main>

      <Footer />
    </>
  );
}
