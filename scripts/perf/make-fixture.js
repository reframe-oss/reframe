// Generates a small synthetic test video (moving gradient + timecode + tone)
// with MediaRecorder in Chrome. Usage: node make-fixture.cjs <seconds> <w> <h> <out> [pageUrl]
// pageUrl must be a secure context (http://localhost is fine).
const fs = require("fs");
const { launch } = require("./browser.js");
const [secs = "6", w = "640", h = "360", out, pageUrl = "http://localhost:4300/privacy"] = process.argv.slice(2);
(async () => {
  const b = await launch();
  const p = await b.newPage();
  await p.goto(pageUrl);
  const res = await p.evaluate(async (secs, w, h) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const stream = c.captureStream(30);
    const ac = new AudioContext(); const osc = ac.createOscillator(); const dst = ac.createMediaStreamDestination();
    osc.frequency.value = 440; osc.connect(dst); osc.start();
    stream.addTrack(dst.stream.getAudioTracks()[0]);
    const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    const t0 = performance.now();
    let raf; const draw = () => {
      const t = (performance.now() - t0) / 1000;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${(t * 60) % 360} 70% 45%)`); g.addColorStop(1, `hsl(${(t * 60 + 120) % 360} 70% 35%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(h / 6)}px sans-serif`; ctx.fillText(t.toFixed(1) + "s", w * 0.08, h * 0.6);
      ctx.fillRect((t / secs) * w, h - 12, 12, 12);
      raf = requestAnimationFrame(draw);
    }; draw();
    rec.start(250);
    await new Promise((r) => setTimeout(r, secs * 1000));
    rec.stop(); await new Promise((r) => (rec.onstop = r)); cancelAnimationFrame(raf);
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video"); v.src = url;
    await new Promise((r) => (v.onloadedmetadata = r));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mime, duration: v.duration, size: blob.size, w: v.videoWidth, h: v.videoHeight, b64: btoa(bin) };
  }, Number(secs), Number(w), Number(h));
  fs.writeFileSync(out, Buffer.from(res.b64, "base64"));
  console.log(JSON.stringify({ mime: res.mime, duration: res.duration, size: res.size, w: res.w, h: res.h, out }));
  await b.close();
})();
