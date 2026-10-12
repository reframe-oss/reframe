import { useState, useEffect } from 'react';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

export function useWaveform(file: File | null) {
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [isGeneratingWaveform, setIsGeneratingWaveform] = useState(false);

  useEffect(() => {
    if (!file) {
      setWaveform(null);
      return;
    }

    let isCancelled = false;
    let audioCtx: AudioContext | null = null;

    const generate = async () => {
      if (file.size > MAX_FILE_SIZE) {
        console.warn("File too large for waveform generation");
        return;
      }

      setIsGeneratingWaveform(true);

      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        if (isCancelled) return;

        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (isCancelled) return;

        const channelData = audioBuffer.getChannelData(0);
        const duration = audioBuffer.duration;
        const targetPeaks = Math.max(100, Math.floor(duration * 10)); // 10 peaks per second
        const peaks: number[] = [];
        const step = Math.ceil(channelData.length / targetPeaks);

        for (let i = 0; i < targetPeaks; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const index = i * step + j;
            if (index < channelData.length) {
              const val = Math.abs(channelData[index]!);
              if (val > max) max = val;
            }
          }
          peaks.push(max);
        }

        const globalMax = Math.max(...peaks, 0.001);
        const normalized = peaks.map((p) => p / globalMax);

        if (!isCancelled) {
          setWaveform(normalized);
        }
      } catch (err) {
        console.error("Waveform generation failed:", err);
      } finally {
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close().catch(console.error);
        }
        if (!isCancelled) setIsGeneratingWaveform(false);
      }
    };

    generate();

    return () => {
      isCancelled = true;
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(console.error);
      }
    };
  }, [file]);

  return { waveform, isGeneratingWaveform };
}
