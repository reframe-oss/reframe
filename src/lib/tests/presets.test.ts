import { describe, it, expect } from "vitest";
import { getPresetById, PRESETS } from "../presets";

describe('getPresetById', () => {
  it('returns correct preset for valid id', () => {
    const preset = getPresetById('vertical-9-16');
    // Using platform since label is '9 : 16'
    expect(preset?.platform).toBe('Reels · TikTok · Shorts');
  });

  it('returns undefined for invalid id', () => {
    expect(getPresetById('invalid-id')).toBeUndefined();
  });

  it('all presets have required fields', () => {
    PRESETS.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.label).toBeTruthy();
      expect(p.platform).toBeTruthy();
    });
  });

  it('returns custom preset correctly', () => {
    const preset = getPresetById('custom');
    expect(preset?.id).toBe('custom');
    expect(preset?.label).toBe('Custom');
  });
});
