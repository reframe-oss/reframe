import VideoEditor from "@/components/VideoEditor";
import Footer from "@/components/Footer";

export default function EditorPage() {
  return (
    <>
     <a
        href="https://github.com/magic-peach/reframe"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden min-[300px]:flex fixed top-4 right-16 z-50 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[10px] font-heading font-semibold uppercase tracking-wider transition-all duration-200 ease-in-out hover:scale-105 hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] hover:shadow-[var(--shadow)]"
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