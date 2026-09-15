import React from 'react';

interface WaveformOverlayProps {
  waveform: number[];
}

export function WaveformOverlay({ waveform }: WaveformOverlayProps) {
  if (!waveform || waveform.length === 0) return null;

  return (
    <div className="w-full h-full opacity-90 z-[5]">
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${waveform.length} 100`}
        preserveAspectRatio="none"
      >
        {waveform.map((val, i) => {
          const height = val * 100;
          const y = 100 - height;
          return (
            <rect
              key={i}
              x={i}
              y={y}
              width="0.8"
              height={height}
              fill="var(--accent)"
            />
          );
        })}
      </svg>
    </div>
  );
}
