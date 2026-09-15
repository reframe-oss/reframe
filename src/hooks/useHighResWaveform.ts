"use client";

import { useEffect, useState, useRef } from "react";

export interface WaveformPeak {
  min: number;
  max: number;
}

interface UseHighResWaveformOptions {
  barCount?: number;
  channel?: number;
}

interface UseHighResWaveformReturn {
  waveform: WaveformPeak[];
  isLoading: boolean;
  error: string | null;
  duration: number;
  sampleRate: number;
}

const DEFAULT_BAR_COUNT = 2048;
const MAX_UNPROTECTED_SIZE = 200 * 1024 * 1024;

type BrowserWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function downsampleChunked(
  data: Float32Array,
  barCount: number
): WaveformPeak[] {
  const chunkSize = Math.max(1, Math.floor(data.length / barCount));
  const peaks: WaveformPeak[] = new Array(barCount);

  for (let i = 0; i < barCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    let min = 0;
    let max = 0;

    for (let j = start; j < end; j++) {
      const sample = data[j] ?? 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    peaks[i] = { min, max };
  }

  let globalMax = 0;
  for (let i = 0; i < barCount; i++) {
    const p = peaks[i];
    globalMax = Math.max(globalMax, Math.abs(p.max), Math.abs(p.min));
  }
  globalMax = Math.max(globalMax, 0.01);

  for (let i = 0; i < barCount; i++) {
    peaks[i] = {
      min: peaks[i].min / globalMax,
      max: peaks[i].max / globalMax,
    };
  }

  return peaks;
}

export function useHighResWaveform(
  src: File | string | null,
  options: UseHighResWaveformOptions = {}
): UseHighResWaveformReturn {
  const { barCount = DEFAULT_BAR_COUNT, channel = 0 } = options;
  const [waveform, setWaveform] = useState<WaveformPeak[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let audioContext: AudioContext | null = null;

    async function extract() {
      if (!src) {
        setWaveform([]);
        setIsLoading(false);
        setDuration(0);
        setSampleRate(0);
        setError(null);
        return;
      }

      if (src instanceof File && src.size > MAX_UNPROTECTED_SIZE) {
        setError(
          `File too large for waveform preview (${(src.size / 1024 / 1024).toFixed(0)}MB). ` +
          `Maximum is ${MAX_UNPROTECTED_SIZE / 1024 / 1024}MB.`
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let arrayBuffer: ArrayBuffer;
        if (src instanceof File) {
          arrayBuffer = await src.arrayBuffer();
        } else {
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Failed to fetch audio: ${response.statusText}`);
          arrayBuffer = await response.arrayBuffer();
        }

        if (cancelRef.current) return;

        const AudioContextCtor =
          window.AudioContext || (window as BrowserWindow).webkitAudioContext;

        if (!AudioContextCtor) {
          throw new Error("AudioContext not supported in this browser");
        }

        audioContext = new AudioContextCtor();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (cancelRef.current) return;

        const rawData = audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1));
        const dur = audioBuffer.duration;
        const sr = audioBuffer.sampleRate;

        const peaks = downsampleChunked(rawData, barCount);

        if (!cancelRef.current) {
          setWaveform(peaks);
          setDuration(dur);
          setSampleRate(sr);
        }
      } catch (e) {
        if (!cancelRef.current) {
          setWaveform([]);
          setError(e instanceof Error ? e.message : "Failed to decode audio");
        }
      } finally {
        if (audioContext) await audioContext.close();
        if (!cancelRef.current) {
          setIsLoading(false);
        }
      }
    }

    extract();

    return () => {
      cancelRef.current = true;
    };
  }, [src, barCount, channel]);

  return { waveform, isLoading, error, duration, sampleRate };
}
