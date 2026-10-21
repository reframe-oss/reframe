// Launches Chrome through puppeteer-core for the perf scripts. No project
// dependency is added: install puppeteer-core ad hoc (see docs/PERFORMANCE.md)
// or point PUPPETEER_CORE at an existing copy. CHROME_PATH selects the browser.
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");

const DEFAULT_CHROME = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
}[process.platform];

exports.launch = (opts = {}) =>
  puppeteer.launch({
    executablePath: process.env.CHROME_PATH || DEFAULT_CHROME,
    headless: "new",
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    ...opts,
  });
