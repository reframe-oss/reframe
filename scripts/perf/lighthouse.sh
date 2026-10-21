#!/bin/bash
# Run Lighthouse N times (mobile preset by default) and print per-run + median metrics.
# Usage: lighthouse.sh <url> <label> [runs] [extra lighthouse flags...]
# Results: ./lh/<label>/run*.json (relative to this script).
URL=$1; LABEL=$2; RUNS=${3:-3}; shift 3
DIR=$(dirname "$0")/lh/$LABEL
mkdir -p "$DIR"
for i in $(seq 1 "$RUNS"); do
  npx -y lighthouse@13.5.0 "$URL" --quiet --only-categories=performance,accessibility,best-practices \
    --chrome-flags="--headless=new" --output=json --output-path="$DIR/run$i.json" "$@" >/dev/null 2>&1
done
node -e '
const fs=require("fs"),dir=process.argv[1];
const runs=fs.readdirSync(dir).filter(f=>/^run\d+\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(dir+"/"+f)));
const pick=r=>({perf:Math.round(r.categories.performance.score*100),a11y:Math.round(r.categories.accessibility.score*100),bp:Math.round(r.categories["best-practices"].score*100),
 fcp:Math.round(r.audits["first-contentful-paint"].numericValue),lcp:Math.round(r.audits["largest-contentful-paint"].numericValue),
 tbt:Math.round(r.audits["total-blocking-time"].numericValue),cls:+r.audits["cumulative-layout-shift"].numericValue.toFixed(3),
 si:Math.round(r.audits["speed-index"].numericValue),bytes:Math.round(r.audits["total-byte-weight"].numericValue/1024),
 reqs:r.audits["network-requests"].details.items.length,
 longTasks:(r.audits["long-tasks"]?.details?.items||[]).length});
const rows=runs.map(pick);rows.forEach((x,i)=>console.log("run"+(i+1),JSON.stringify(x)));
const med=k=>{const v=rows.map(r=>r[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
console.log("MEDIAN",JSON.stringify(Object.fromEntries(Object.keys(rows[0]).map(k=>[k,med(k)]))));
console.log("env: lighthouse",runs[0].lighthouseVersion,"| UA",runs[0].environment.hostUserAgent.match(/Chrome\/[\d.]+/)[0],"| formFactor",runs[0].configSettings.formFactor,"| throttling",runs[0].configSettings.throttlingMethod, JSON.stringify(runs[0].configSettings.throttling));
' "$DIR"
