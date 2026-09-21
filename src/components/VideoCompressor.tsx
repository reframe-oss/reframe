"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Download, Settings2, Zap } from 'lucide-react';

interface VideoCompressorProps {
  videoFile: File | null;
}

const VideoCompressor: React.FC<VideoCompressorProps> = ({ videoFile }) => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Loading FFmpeg...');
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [preset, setPreset] = useState<'balanced' | 'small'>('balanced');
  const ffmpegRef = useRef<any>(null);

  useEffect(() => {
    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(s);
      });

    const init = async () => {
      try {
        // ✅ v0.11.x - no SharedArrayBuffer, no Worker CORS issues
        await loadScript('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.10.1/dist/ffmpeg.min.js');
        setStatus('Ready');
      } catch (err) {
        setStatus('Failed to load FFmpeg');
        console.error(err);
      }
    };
    init();
  }, []);

  const compressVideo = async () => {
    if (!videoFile) return;

    const { createFFmpeg, fetchFile } = (window as any).FFmpeg;

    if (!createFFmpeg) {
      setStatus('FFmpeg not loaded yet.');
      return;
    }

    setIsCompressing(true);
    setProgress(0);

    try {
      // ✅ corePath points to v0.11.x core - no worker spawning
      const ffmpeg = createFFmpeg({
        corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js',
        progress: ({ ratio }: { ratio: number }) => {
          setProgress(Math.min(99, Math.round(ratio * 100)));
        },
        log: false,
      });

      ffmpegRef.current = ffmpeg;

      setStatus('Loading FFmpeg core...');
      await ffmpeg.load();

      setStatus('Writing file...');
      ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));

      setStatus('Compressing...');
      const args = preset === 'small'
        ? ['-i', 'input.mp4', '-vcodec', 'libx264', '-crf', '28', '-preset', 'veryfast', '-acodec', 'aac', 'output.mp4']
        : ['-i', 'input.mp4', '-vcodec', 'libx264', '-crf', '23', '-preset', 'medium', '-acodec', 'aac', 'output.mp4'];

      await ffmpeg.run(...args);

      setStatus('Finalizing...');
      const data = ffmpeg.FS('readFile', 'output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });

      setCompressedBlob(blob);
      setProgress(100);
      setStatus('Done!');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div className="p-4 bg-gray-900 text-white rounded-xl border border-gray-700 shadow-xl max-w-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Zap className="text-yellow-400" /> Compression Tool
        </h3>
        <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-gray-800 rounded-full">
          <Settings2 size={18} />
        </button>
      </div>

      {showSettings && (
        <div className="mb-4 bg-gray-800 p-3 rounded-lg text-sm">
          <label htmlFor="compression-preset" className="block mb-2 text-gray-400">Choose Preset</label>
          <select
            id="compression-preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value as 'balanced' | 'small')}
            className="w-full bg-gray-900 border border-gray-700 rounded p-2"
          >
            <option value="balanced">Balanced (Recommended)</option>
            <option value="small">Smallest Size</option>
          </select>
        </div>
      )}

      <p className="text-xs text-gray-400 mb-3">Status: {status}</p>

      {!isCompressing && !compressedBlob && (
        <button
          onClick={compressVideo}
          disabled={status !== 'Ready'}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed py-2 rounded-lg font-medium transition"
        >
          Export & Compress
        </button>
      )}

      {isCompressing && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span>{status}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      
      {compressedBlob && (
       <a 
          href={URL.createObjectURL(compressedBlob)}
          download="compressed_video.mp4"
          className="w-full flex items-center justify-center gap-2 bg-green-600 py-2 rounded-lg font-medium hover:bg-green-500 transition"
        >
          <Download size={18} /> Download Video
        </a>
      )}

    </div>  
  );        
};          


export default VideoCompressor;