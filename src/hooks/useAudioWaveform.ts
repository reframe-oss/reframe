"use client";

import { useEffect, useState } from "react";

const DEFAULT_BAR_COUNT = 96;

type BrowserWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function downsampleWaveform(channelData: Float32Array, barCount: number): number[] {
  const sampleSize = Math.max(1, Math.floor(channelData.length / barCount));
  const peaks = Array.from({ length: barCount }, (_, index) => {
    const start = index * sampleSize;
    const end = Math.min(start + sampleSize, channelData.length);
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(channelData[i] ?? 0));
    }

    return peak;
  });

  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((peak) => peak / maxPeak);
}

export function useAudioWaveform(
  file: File | null,
  barCount = DEFAULT_BAR_COUNT
) {
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let audioContext: AudioContext | null = null;

    async function extractWaveform() {
      if (!file) {
        setWaveform([]);
        setIsLoading(false);
        return;
      }

      // Skip decoding for files larger than 100MB to prevent browser OOM crash
      if (file.size > 100 * 1024 * 1024) {
        setWaveform([]);
        setIsLoading(false);
        return;
      }

      const AudioContextCtor =
        window.AudioContext || (window as BrowserWindow).webkitAudioContext;

      if (!AudioContextCtor) {
        setWaveform([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        audioContext = new AudioContextCtor();
        const audioBuffer = await audioContext.decodeAudioData(
          await file.arrayBuffer()
        );
        const channelData = audioBuffer.getChannelData(0);
        const peaks = downsampleWaveform(channelData, barCount);

        if (!isCancelled) {
          setWaveform(peaks);
        }
      } catch {
        if (!isCancelled) {
          setWaveform([]);
        }
      } finally {
        await audioContext?.close();
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    extractWaveform();

    return () => {
      isCancelled = true;
    };
  }, [barCount, file]);

  return { waveform, isLoading };
}
