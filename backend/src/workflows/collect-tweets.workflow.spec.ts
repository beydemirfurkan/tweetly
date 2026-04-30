import {
  reduceGrowthTargetForSafety,
  resolveGrowthDailyTarget,
  type GrowthSafetyOptions,
  type GrowthTargetOptions,
} from './collect-tweets.workflow';

describe('growth scheduling helpers', () => {
  const baseTargetOptions: GrowthTargetOptions = {
    growthEnabled: true,
    rampUpEnabled: false,
    legacyTarget: 20,
    baseDate: new Date('2026-04-29T12:00:00Z'),
    rampUpStartDate: '',
    weekdayTargetMin: 20,
    weekdayTargetMax: 23,
    weekendTargetMin: 24,
    weekendTargetMax: 28,
    week1WeekdayTarget: 20,
    week1WeekendTarget: 20,
    week2WeekdayTarget: 20,
    week2WeekendTarget: 23,
  };

  it('keeps the legacy target when growth is disabled', () => {
    expect(resolveGrowthDailyTarget({ ...baseTargetOptions, growthEnabled: false })).toBe(20);
  });

  it('uses ramp-up targets before full growth targets', () => {
    expect(resolveGrowthDailyTarget({ ...baseTargetOptions, rampUpEnabled: true })).toBe(20);
    expect(
      resolveGrowthDailyTarget({
        ...baseTargetOptions,
        rampUpEnabled: true,
        baseDate: new Date('2026-05-02T12:00:00Z'),
      }),
    ).toBe(20);
  });

  it('uses higher weekend targets after ramp-up', () => {
    const weekdayTarget = resolveGrowthDailyTarget(baseTargetOptions);
    const weekendTarget = resolveGrowthDailyTarget({
      ...baseTargetOptions,
      baseDate: new Date('2026-05-03T12:00:00Z'),
    });

    expect(weekdayTarget).toBeGreaterThanOrEqual(20);
    expect(weekdayTarget).toBeLessThanOrEqual(23);
    expect(weekendTarget).toBeGreaterThanOrEqual(24);
    expect(weekendTarget).toBeLessThanOrEqual(28);
  });
});

describe('growth safety helpers', () => {
  const baseSafetyOptions: GrowthSafetyOptions = {
    safetyEnabled: true,
    legacyTarget: 20,
    target: 28,
    authFailures: 0,
    authFailureSoftLimit: 1,
    postFailureRate: 0,
    postFailureSamples: 0,
    postFailureMinSamples: 5,
    postFailureRateThreshold: 0.2,
    reductionFactor: 0.5,
  };

  it('falls back to legacy target on auth failures', () => {
    expect(reduceGrowthTargetForSafety({ ...baseSafetyOptions, authFailures: 1 })).toBe(20);
  });

  it('reduces growth target when post failure rate is high', () => {
    expect(
      reduceGrowthTargetForSafety({
        ...baseSafetyOptions,
        postFailureRate: 0.4,
        postFailureSamples: 10,
      }),
    ).toBe(20);
  });
});
