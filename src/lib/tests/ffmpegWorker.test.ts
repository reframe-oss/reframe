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
    async exec(args: string[]) {
      this.execCalls.push(args);
      if (FakeFFmpeg.execImpl) return FakeFFmpeg.execImpl(args);
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
});
