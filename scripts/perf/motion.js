// Counts elements with active CSS transitions / infinite animations, with and
// without prefers-reduced-motion.
const { launch } = require("./browser.js");
(async () => {
  const b = await launch();
  // Usage: node motion.cjs <label>=<url> [<label>=<url> ...]
  const targets = process.argv.slice(2).map((a) => a.split(/=(.+)/));
  for (const [label, url] of targets) {
    for (const rm of ["no-preference", "reduce"]) {
      const p = await b.newPage();
      await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: rm }]);
      await p.evaluateOnNewDocument(() => localStorage.setItem("reframe_onboarding_complete", "1"));
      await p.goto(url, { waitUntil: "networkidle0" });
      const r = await p.evaluate(() => {
        const all = [...document.querySelectorAll("*")];
        const dur = (el) => Math.max(...getComputedStyle(el).transitionDuration.split(",").map((s) => parseFloat(s) * (s.includes("ms") ? 1 : 1000)));
        const withTransition = all.filter((el) => dur(el) > 1);
        const btn = document.querySelector(".btn") || document.querySelector("button");
        const anims = all.filter((el) => { const cs = getComputedStyle(el); return cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0.001 && cs.animationIterationCount === "infinite"; });
        return { elements: all.length, withTransition: withTransition.length, sampleButtonTransition: getComputedStyle(btn).transitionDuration, infiniteAnimations: anims.length };
      });
      console.log(label, rm, JSON.stringify(r));
      await p.close();
    }
  }
  await b.close();
})();
