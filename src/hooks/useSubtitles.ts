import { useState, useRef, useCallback } from "react";
import { Subtitle } from "@/lib/types";

export function useSubtitles() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const generateSubtitles = useCallback(async (file: File, onComplete: (subtitles: Subtitle[]) => void) => {
    setIsGenerating(true);
    setError(null);
    setProgressText("Extracting audio...");
    setProgressPercent(0);

    try {
      // 1. Extract audio from video file using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioData = audioBuffer.getChannelData(0); // Whisper expects mono audio
      
      setProgressText("Loading AI model (this may take a minute)...");

      // 2. Initialize worker
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('@/lib/whisper.worker.ts', import.meta.url), { type: 'module' });
      }
      
      const worker = workerRef.current;

      worker.onmessage = (e) => {
        const { type, status, info, output, message } = e.data;

        if (type === 'progress') {
          if (status) setProgressText(status);
          if (info && info.progress) {
            setProgressPercent(info.progress);
          }
        } else if (type === 'ready') {
          setProgressText("Transcribing audio...");
          setProgressPercent(0);
          worker.postMessage({ type: 'generate', audio: audioData });
        } else if (type === 'result') {
          // Process output into subtitles
          const chunks = output.chunks || [];
          const newSubtitles: Subtitle[] = chunks.map((chunk: any, i: number) => {
            const [start, end] = chunk.timestamp;
            return {
              id: `sub-${Date.now()}-${i}`,
              text: chunk.text.trim(),
              startTime: start,
              endTime: end || start + 2, // fallback if end is null
              x: -1, // center horizontally
              y: 90, // bottom
              fontSize: 48,
              color: "#ffffff",
              fontWeight: "bold",
            };
          });

          onComplete(newSubtitles);
          setIsGenerating(false);
          setProgressText("");
        } else if (type === 'error') {
          setError(message);
          setIsGenerating(false);
        }
      };

      // Load model
      worker.postMessage({ type: 'load' });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate subtitles.");
      setIsGenerating(false);
    }
  }, []);

  const cancelGeneration = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsGenerating(false);
    setProgressText("");
    setProgressPercent(0);
  }, []);

  return {
    isGenerating,
    progressText,
    progressPercent,
    error,
    generateSubtitles,
    cancelGeneration,
  };
}
