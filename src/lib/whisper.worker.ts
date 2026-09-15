import { pipeline, env } from '@xenova/transformers';

// Disable local models, since we want to download from the Hub
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

let transcriber: any = null;

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, audio, model } = e.data;

  if (type === 'load') {
    try {
      if (!transcriber) {
        self.postMessage({ type: 'progress', status: 'Loading model...' });
        
        transcriber = await pipeline('automatic-speech-recognition', model || 'Xenova/whisper-tiny.en', {
          progress_callback: (info: any) => {
            self.postMessage({ type: 'progress', info });
          }
        });
      }
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err.message });
    }
  } else if (type === 'generate') {
    try {
      if (!transcriber) {
        throw new Error("Transcriber not loaded");
      }
      
      self.postMessage({ type: 'progress', status: 'Generating subtitles...' });
      
      const output = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      });

      self.postMessage({ type: 'result', output });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
});
