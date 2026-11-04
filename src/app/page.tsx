import VideoEditor from "@/components/VideoEditor";
import Footer from "@/components/Footer";

// The <main id="main-content"> landmark lives in layout.tsx; nesting a second
// one here produced two main landmarks with the same id. The GitHub link now
// sits in the header instead of a fixed badge that overlapped the controls.
export default function Home() {
  return (
    <>
      <VideoEditor />
      <Footer />
    </>
  );
}
