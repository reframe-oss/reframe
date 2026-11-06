import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_RECIPE } from "../constants";
import type { EditRecipe } from "../types";

// Drives the real worker module (the code that runs in production) against a
// fake FFmpeg, so command-line fixes are tested where they execute rather
// than in a copy.

const h = vi.hoisted(() => {
  type Listener = (event: { message?: string; progress?: number }) => void;
  class FakeFFmpeg {
    static instances: FakeFFmpeg[] = [];
    static loadImpl: (config: Record<string, string>) => Promise<void> = async () => {};
    static execImpl: ((args: string[]) => Promise<number>) | null = null;
    listeners = { progress: new Set<Listener>(), log: new Set<Listener>() };
    config: Record<string, string> = {};
    execCalls: string[][] = [];
    deleted: string[] = [];
    files = new Map<string, Uint8Array>();
    /** Every write, kept after cleanup deletes the file. */
    writes = new Map<string, Uint8Array>();
    terminated = false;
    constructor() {
      FakeFFmpeg.instances.push(this);
    }
    on(event: "progress" | "log", fn: Listener) {
      this.listeners[event].add(fn);
    }
    off(event: "progress" | "log", fn: Listener) {
      this.listeners[event].delete(fn);
    }
    async load(config: Record<string, string>) {
      this.config = config;
      await FakeFFmpeg.loadImpl(config);
    }
    async writeFile(name: string, data: Uint8Array) {
      this.files.set(name, data);
      this.writes.set(name, data);
    }
    async exec(args: string[], _timeout?: number, opts?: { signal?: AbortSignal }) {
      this.execCalls.push(args);
      if (FakeFFmpeg.execImpl) {
        // Like @ffmpeg/ffmpeg: an abort rejects the call, but the command
        // itself keeps running in the engine.
        const run = FakeFFmpeg.execImpl(args);
        const signal = opts?.signal;
        if (!signal) return run;
        return Promise.race([
          run,
          new Promise<number>((_, reject) =>
            signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
          ),
        ]);
      }
      this.listeners.log.forEach((fn) => fn({ message: "frame=  1 fps=0.0 time=00:00:00.04" }));
      this.listeners.progress.forEach((fn) => fn({ progress: 0.5 }));
      this.files.set(args.at(-1)!, new Uint8Array([1, 2, 3]));
      return 0;
    }
    async readFile(name: string) {
      return this.files.get(name)!;
    }
    async deleteFile(name: string) {
      this.deleted.push(name);
    }
    mounts: { type: string; files: File[]; dir: string }[] = [];
    unmounted: string[] = [];
    async createDir() {}
    async deleteDir() {}
    async mount(type: string, opts: { files: File[] }, dir: string) {
      this.mounts.push({ type, files: opts.files, dir });
    }
    async unmount(dir: string) {
      this.unmounted.push(dir);
    }
    terminate() {
      this.terminated = true;
    }
  }
  return { FakeFFmpeg };
});

vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: h.FakeFFmpeg }));
vi.mock("@ffmpeg/util", () => ({ toBlobURL: vi.fn() }));

const posted: { type: string; [k: string]: unknown }[] = [];
let handler: ((event: MessageEvent) => void) | null = null;

async function startWorker({ isolated, cores = 11 }: { isolated: boolean; cores?: number }) {
  Object.defineProperty(window, "crossOriginIsolated", { configurable: true, value: isolated });
  Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: cores });
  const add = vi.spyOn(self, "addEventListener");
  vi.resetModules();
  await import("../ffmpeg.worker");
  const call = add.mock.calls.find(([type]) => type === "message")!;
  handler = call[1] as (event: MessageEvent) => void;
  add.mockRestore();
}

const send = (data: unknown) => handler!({ data } as MessageEvent);
const waitFor = (type: string) => vi.waitFor(() => expect(posted.some((m) => m.type === type)).toBe(true));
const ffmpeg = () => h.FakeFFmpeg.instances.at(-1)!;

function exportRequest(recipe: Partial<EditRecipe> = {}) {
  return {
    type: "export",
    id: "job1",
    file: { name: "My holiday.mp4", type: "video/mp4", data: new ArrayBuffer(16) },
    recipe: { ...DEFAULT_RECIPE, ...recipe },
    videoDuration: 6,
  };
}

beforeEach(() => {
  posted.length = 0;
  h.FakeFFmpeg.instances.length = 0;
  h.FakeFFmpeg.loadImpl = async () => {};
  h.FakeFFmpeg.execImpl = null;
  vi.stubGlobal("postMessage", vi.fn((msg) => posted.push(msg)));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) }))
  );
  URL.createObjectURL = vi.fn(() => "blob:core");
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (handler) self.removeEventListener("message", handler as EventListener);
  handler = null;
});

describe("ffmpeg.worker", () => {
  it("isolated: loads the MT core and caps threads in the command it runs", async () => {
    await startWorker({ isolated: true, cores: 16 });
    send({ type: "load" });
    await waitFor("ready");
    expect(posted.find((m) => m.type === "ready")).toMatchObject({ mode: "multi" });
    expect(ffmpeg().config.coreURL).toBeDefined();
    expect(ffmpeg().config.workerURL).toBeDefined();
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain("@ffmpeg/core-mt@");
    // Every engine file, including the pthread worker script, is fetched
    // with a Subresource Integrity hash.
    expect(vi.mocked(fetch).mock.calls.map(([url, init]) => [String(url).split("/").pop(), Boolean((init as RequestInit)?.integrity)])).toEqual([
      ["ffmpeg-core.js", true],
      ["ffmpeg-core.wasm", true],
      ["ffmpeg-core.worker.js", true],
    ]);

    send(exportRequest({ sharpness: 2, volume: 50 }));
    await waitFor("result");
    const args = ffmpeg().execCalls[0]!;
    const threads = args.flatMap((a, i) => (a === "-threads" ? [args[i + 1]] : []));
    expect(threads).toEqual(["4", "4"]);
    // Settings the old in-worker copy silently ignored:
    expect(args.join(" ")).toContain("unsharp=5:5:2");
    expect(args.join(" ")).toContain("volume=0.50");
  });

  it("not isolated: loads the single-threaded core and passes no thread flags", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    expect(posted.find((m) => m.type === "ready")).toMatchObject({ mode: "single" });
    expect(ffmpeg().config.workerURL).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain("@ffmpeg/core@");
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => Boolean((init as RequestInit)?.integrity))).toBe(true);

    send(exportRequest());
    await waitFor("result");
    expect(ffmpeg().execCalls[0]).not.toContain("-threads");
  });

  it("falls back to the single-threaded core if the MT core fails to load", async () => {
    await startWorker({ isolated: true });
    h.FakeFFmpeg.loadImpl = async (config) => {
      if (config.workerURL) throw new Error("MT instantiate failed");
    };
    send({ type: "load" });
    await waitFor("ready");
    expect(posted.find((m) => m.type === "ready")).toMatchObject({ mode: "single" });
    expect(h.FakeFFmpeg.instances[0]!.terminated).toBe(true);

    send(exportRequest());
    await waitFor("result");
    expect(ffmpeg().execCalls[0]).not.toContain("-threads");
  });

  it("honours singleThread on load even when isolated", async () => {
    await startWorker({ isolated: true });
    send({ type: "load", singleThread: true });
    await waitFor("ready");
    expect(posted.find((m) => m.type === "ready")).toMatchObject({ mode: "single" });
  });

  it("reports a failed engine download instead of loading garbage", async () => {
    await startWorker({ isolated: false });
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as Response);
    send({ type: "load" });
    await waitFor("error");
    expect(posted.find((m) => m.type === "error")?.message).toMatch(/HTTP 404/);
  });

  it("removes its listeners and temp files after every export, and sends heartbeats", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    for (let i = 0; i < 3; i++) {
      posted.length = 0;
      send({ ...exportRequest(), id: `job${i}` });
      await waitFor("result");
    }
    expect(ffmpeg().listeners.log.size).toBe(0);
    expect(ffmpeg().listeners.progress.size).toBe(0);
    expect(ffmpeg().deleted).toEqual(expect.arrayContaining(["input_job2.mp4", "output_job2.mp4"]));
    expect(posted.some((m) => m.type === "heartbeat")).toBe(true);
    // Temp names come from the job id, never the user's file name.
    expect([...ffmpeg().files.keys()].some((name) => name.includes("holiday"))).toBe(false);
  });

  it("reads the user's File itself when sent one, instead of the page reading it", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    const req = exportRequest();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    send({ ...req, file: { name: "clip.mp4", type: "video/mp4", blob: new Blob([bytes]) } });
    await waitFor("result");
    const written = [...ffmpeg().writes.entries()].find(([name]) => name.startsWith("input_"));
    expect(written?.[1]).toEqual(bytes);
  });

  it("writes the bundled font into FFmpeg's filesystem only for exports with text", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    send(exportRequest());
    await waitFor("result");
    expect([...ffmpeg().writes.keys()]).not.toContain("reframe-text.ttf");

    posted.length = 0;
    send({ ...exportRequest({ textOverlays: [{ id: "t", text: "Hi", x: 50, y: 20, fontSize: 48, color: "#fff", fontWeight: "normal" }] }), id: "job2" });
    await waitFor("result");
    expect([...ffmpeg().writes.keys()]).toContain("reframe-text.ttf");
    expect(ffmpeg().execCalls.at(-1)!.join(" ")).toContain("fontfile=reframe-text.ttf");
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/fonts/Geist-Regular.ttf"))).toBe(true);
  });

  it("posts the output as a Blob, so the page never copies the file on its thread", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    send(exportRequest());
    await waitFor("result");
    const result = posted.find((m) => m.type === "result") as { blob?: unknown; data?: unknown; mimeType?: string };
    expect(result.blob).toBeInstanceOf(Blob);
    expect((result.blob as Blob).type).toBe(result.mimeType);
    expect(result.data).toBeUndefined();
  });

  it("reports a wasm trap (a rejected string) with its text, not 'undefined'", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    h.FakeFFmpeg.execImpl = () => Promise.reject("RuntimeError: memory access out of bounds");
    send(exportRequest());
    await waitFor("error");
    expect(posted.find((m) => m.type === "error")).toMatchObject({
      id: "job1",
      message: "RuntimeError: memory access out of bounds",
    });
  });

  it("GIF exports use the shared two-pass builder with thread caps", async () => {
    await startWorker({ isolated: true });
    send({ type: "load" });
    await waitFor("ready");
    send(exportRequest({ format: "gif" }));
    await waitFor("result");
    const [palette, render] = ffmpeg().execCalls;
    expect(palette!.join(" ")).toContain("palettegen");
    expect(render!.join(" ")).toContain("paletteuse");
    expect(render).toContain("-filter_complex_threads");
  });

  describe("timeline frames", () => {
    const framesRequest = (id = "f1") => ({
      type: "frames",
      id,
      file: new File([new Uint8Array(8)], "My holiday.mov", { type: "video/quicktime" }),
      times: [0, 2.5, 5],
      width: 160,
    });

    it("mounts the file under a neutral name and makes one small JPEG per time", async () => {
      await startWorker({ isolated: true, cores: 16 });
      send({ type: "load" });
      await waitFor("ready");
      send(framesRequest());
      await waitFor("frames-done");

      const { mounts, unmounted, execCalls } = ffmpeg();
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.type).toBe("WORKERFS");
      expect(mounts[0]!.files[0]!.name).toBe("source.mov");
      expect(unmounted).toEqual([mounts[0]!.dir]);
      expect(execCalls).toHaveLength(3);
      for (const args of execCalls) {
        expect(args.join(" ")).not.toContain("My holiday");
        expect(args.slice(0, 2)).toEqual(["-ss", expect.any(String)]);
        expect(args).toContain("-frames:v");
        // One thread on the MT core, never FFmpeg's automatic count.
        expect(args.flatMap((a, i) => (a === "-threads" ? [args[i + 1]] : []))).toEqual(["1", "1"]);
      }
      const frames = posted.filter((m) => m.type === "frame");
      expect(frames.map((m) => [m.index, m.time])).toEqual([[0, 0], [1, 2.5], [2, 5]]);
      expect(frames.every((m) => m.blob instanceof Blob && (m.blob as Blob).type === "image/jpeg")).toBe(true);
      expect(posted.find((m) => m.type === "frames-done")).toMatchObject({ id: "f1", skipped: 0 });
    });

    it("skips a frame FFmpeg can't make instead of failing the strip", async () => {
      await startWorker({ isolated: false });
      send({ type: "load" });
      await waitFor("ready");
      let n = 0;
      h.FakeFFmpeg.execImpl = async (args) => {
        if (n++ === 1) return 1;
        ffmpeg().files.set(args.at(-1)!, new Uint8Array([1]));
        return 0;
      };
      send(framesRequest());
      await waitFor("frames-done");
      expect(posted.filter((m) => m.type === "frame").map((m) => m.index)).toEqual([0, 2]);
      expect(posted.find((m) => m.type === "frames-done")).toMatchObject({ skipped: 1 });
    });

    it("an export takes the engine: the frame job is cancelled first", async () => {
      await startWorker({ isolated: true });
      send({ type: "load" });
      await waitFor("ready");
      let release: () => void = () => {};
      h.FakeFFmpeg.execImpl = (args) =>
        args.includes("-frames:v") && args.at(-1)!.startsWith("frame_")
          ? new Promise((resolve) => (release = () => resolve(0)))
          : (ffmpeg().files.set(args.at(-1)!, new Uint8Array([1, 2, 3])), Promise.resolve(0));
      send(framesRequest());
      await vi.waitFor(() => expect(ffmpeg().execCalls).toHaveLength(1));
      send(exportRequest());
      // The running frame command is never abandoned: the export's command
      // waits until it has really finished, so their output can't mix.
      await new Promise((r) => setTimeout(r, 50));
      expect(ffmpeg().execCalls).toHaveLength(1);
      release();
      await waitFor("frames-cancelled");
      await waitFor("result");
      expect(posted.findIndex((m) => m.type === "frames-cancelled")).toBeLessThan(posted.findIndex((m) => m.type === "result"));
      expect(ffmpeg().unmounted).toHaveLength(1);
    });

    it("refuses frames while an export is running", async () => {
      await startWorker({ isolated: false });
      send({ type: "load" });
      await waitFor("ready");
      h.FakeFFmpeg.execImpl = () => new Promise(() => {});
      send(exportRequest());
      await vi.waitFor(() => expect(ffmpeg().execCalls).toHaveLength(1));
      send(framesRequest("f2"));
      await waitFor("frames-error");
      expect(posted.find((m) => m.type === "frames-error")).toMatchObject({ id: "f2", message: "busy" });
    });
  });

  it("never reports FFmpeg's no-timestamp marker as encoded time", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    h.FakeFFmpeg.execImpl = async (args) => {
      const f = ffmpeg();
      // INT64_MAX µs, as the core sends it before the palette has a timestamp.
      f.listeners.progress.forEach((fn) => fn({ progress: 0, time: 9223372036854775807 } as never));
      f.listeners.progress.forEach((fn) => fn({ progress: 0.5, time: 1_500_000 } as never));
      f.files.set(args.at(-1)!, new Uint8Array([1]));
      return 0;
    };
    send(exportRequest({ format: "gif", trimEnd: 2 }));
    await waitFor("result");
    const seconds = posted.filter((m) => m.type === "progress").map((m) => m.outputSeconds);
    expect(seconds).toContain(1.5);
    expect(seconds.every((s) => s === undefined || (s as number) < 1e6)).toBe(true);
  });

  it("joins clips from a read-only mount, giving silence to a clip without sound", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    h.FakeFFmpeg.execImpl = async (args) => {
      const f = ffmpeg();
      const input = args[args.indexOf("-i") + 1]!;
      if (args.includes("0:a:0")) {
        // The probe: the log describes the streams; only the first clip has audio.
        f.listeners.log.forEach((fn) => fn({ message: "  Stream #0:0: Video: h264, yuv420p, 1280x720, 25 fps, 25 tbr" }));
        return input.includes("clip0") ? 0 : 1;
      }
      f.files.set(args.at(-1)!, new Uint8Array([7, 7]));
      return 0;
    };
    send({
      type: "join",
      id: "join1",
      clips: [
        { file: new File([new Uint8Array(4)], "Beach day.mp4", { type: "video/mp4" }), duration: 4 },
        { file: new File([new Uint8Array(4)], "Sunset.MOV", { type: "video/quicktime" }), duration: 2.5 },
      ],
      width: 1281,
      height: 720,
    });
    await waitFor("result");
    const f = ffmpeg();
    const mount = f.mounts.at(-1)!;
    expect(mount.type).toBe("WORKERFS");
    expect(mount.files.map((file) => file.name)).toEqual(["clip0.mp4", "clip1.MOV"]);
    expect(f.unmounted).toContain(mount.dir);
    const join = f.execCalls.at(-1)!;
    const graph = join[join.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720");
    expect(graph).toContain("fps=25,");
    expect(graph).toContain("anullsrc=r=48000:cl=stereo,atrim=0:2.5");
    expect(graph).toContain("concat=n=2:v=1:a=1[v][a]");
    // The user's file names never reach FFmpeg.
    expect(f.execCalls.flat().some((arg) => /Beach|Sunset/.test(arg))).toBe(false);
    const result = posted.find((m) => m.type === "result")!;
    expect(result).toMatchObject({ id: "join1", format: "mp4", width: 1280, height: 720 });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(f.listeners.log.size).toBe(0);
    expect(f.listeners.progress.size).toBe(0);
  });

  it("exports sound only as MP3, with no video encoder", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    send(exportRequest({ format: "mp3" }));
    await waitFor("result");
    const args = ffmpeg().execCalls.at(-1)!;
    expect(args).toContain("-vn");
    expect(args).toContain("libmp3lame");
    expect(args.at(-1)).toBe("output_job1.mp3");
    expect(posted.find((m) => m.type === "result")).toMatchObject({ format: "mp3", mimeType: "audio/mpeg" });
  });

  it("says plainly when an audio-only export has no sound to export", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    h.FakeFFmpeg.execImpl = async () => {
      ffmpeg().listeners.log.forEach((fn) => fn({ message: "Stream map '0:a:0' matches no streams." }));
      return 1;
    };
    send(exportRequest({ format: "wav" }));
    await waitFor("error");
    expect(posted.find((m) => m.type === "error")?.message).toBe(
      "This video has no sound to export. Add a soundtrack, or choose a video format."
    );
    expect(ffmpeg().execCalls).toHaveLength(1);
  });

  it("never uses the user's file name as a path in FFmpeg's filesystem", async () => {
    await startWorker({ isolated: false });
    send({ type: "load" });
    await waitFor("ready");
    send({
      ...exportRequest(),
      file: { name: "../../etc/holiday.mp4/..", type: "video/mp4", data: new ArrayBuffer(16) },
      overlayFile: { name: "logo.p/ng", type: "image/png", data: new ArrayBuffer(4) },
      overlayOptions: { file: null, position: "bottom-right", size: 100, opacity: 100 },
    });
    await waitFor("result");
    const written = [...ffmpeg().writes.keys()];
    expect(written).toContain("input_job1.mp4");
    expect(written).toContain("overlay_job1.png");
    expect(written.some((name) => name.includes("/") || name.includes(".."))).toBe(false);
  });
});
