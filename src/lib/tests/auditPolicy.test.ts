// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluate } from "../../../scripts/security/audit-policy.mjs";

const adv = (severity: string, ghsa: string) => ({
  severity,
  url: `https://github.com/advisories/${ghsa}`,
  title: `t-${ghsa}`,
  vulnerable_versions: "<1.0.0",
});
const exception = (pkg: string, ghsa: string, expires = "2027-01-01") => ({ package: pkg, advisory: ghsa, reason: "dev-only", expires });

describe("dependency audit policy", () => {
  it("blocks unexcepted high and critical advisories, never moderate or low", () => {
    const r = evaluate({ a: [adv("critical", "GHSA-1"), adv("moderate", "GHSA-2")], b: adv("high", "GHSA-3"), c: adv("low", "GHSA-4") }, [], "2026-10-22");
    expect(r.ok).toBe(false);
    expect(r.blocking.map((x: { id: string }) => x.id)).toEqual(["GHSA-1", "GHSA-3"]);
    expect(r.warnings).toHaveLength(2);
  });

  it("lets a reviewed, unexpired exception through but still lists it", () => {
    const r = evaluate({ braces: [adv("high", "GHSA-x")] }, [exception("braces", "GHSA-x")], "2026-10-22");
    expect(r.ok).toBe(true);
    expect(r.excepted).toHaveLength(1);
  });

  it("only matches the exact package and advisory", () => {
    const r = evaluate({ other: [adv("high", "GHSA-x")] }, [exception("braces", "GHSA-x")], "2026-10-22");
    expect(r.ok).toBe(false);
    expect(r.unused).toEqual(["braces|GHSA-x"]);
  });

  it("blocks again once an exception expires, and rejects open-ended ones", () => {
    expect(evaluate({ braces: [adv("high", "GHSA-x")] }, [exception("braces", "GHSA-x", "2026-10-01")], "2026-10-22").ok).toBe(false);
    expect(evaluate({}, [exception("braces", "GHSA-x", "2028-01-01")], "2026-10-22").problems[0]).toMatch(/more than 90 days/);
    expect(evaluate({}, [{ package: "x", advisory: "y", expires: "2026-11-01" }], "2026-10-22").problems[0]).toMatch(/needs a reason/);
  });

  it("passes a clean audit", () => {
    expect(evaluate({}, [], "2026-10-22")).toMatchObject({ ok: true, blocking: [], problems: [] });
  });
});
