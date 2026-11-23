import assert from "node:assert/strict";
import test from "node:test";

import { getPeriodLabel, getPricingPeriod } from "../src/time-manager.ts";

import type { AutoModelConfig } from "../src/types.ts";

function config(
  timeZone: string,
  holidays: string[] = [],
): AutoModelConfig {
  return {
    timeZone,
    promptOnNewSession: false,
    promptOnStartup: false,
    holidays,
    plans: { peak: {}, offPeak: {} },
  };
}

test("getPricingPeriod marks weekday work hours as peak", () => {
  const utc = config("UTC");

  assert.equal(getPricingPeriod(utc, new Date("2026-11-23T10:00:00Z")), "peak");
  assert.equal(getPricingPeriod(utc, new Date("2026-11-23T15:00:00Z")), "peak");
});

test("getPricingPeriod treats the lunch break, early and late hours as off-peak", () => {
  const utc = config("UTC");

  assert.equal(getPricingPeriod(utc, new Date("2026-11-23T08:59:00Z")), "offPeak");
  assert.equal(getPricingPeriod(utc, new Date("2026-11-23T12:30:00Z")), "offPeak");
  assert.equal(getPricingPeriod(utc, new Date("2026-11-23T18:00:00Z")), "offPeak");
});

test("getPricingPeriod is off-peak on weekends", () => {
  const utc = config("UTC");

  assert.equal(getPricingPeriod(utc, new Date("2026-11-21T10:00:00Z")), "offPeak");
  assert.equal(getPricingPeriod(utc, new Date("2026-11-22T15:00:00Z")), "offPeak");
});

test("getPricingPeriod honours holidays in the local calendar", () => {
  const utc = config("UTC", ["2026-11-23"]);

  assert.equal(getPricingPeriod(utc, new Date("2026-11-23T10:00:00Z")), "offPeak");
});

test("getPricingPeriod reads the hour and date in the configured time zone", () => {
  // 02:00 UTC is 10:00 in Shanghai (peak) but 03:00 in Berlin (off-peak).
  const instant = new Date("2026-11-23T02:00:00Z");

  assert.equal(getPricingPeriod(config("Asia/Shanghai"), instant), "peak");
  assert.equal(getPricingPeriod(config("Europe/Berlin"), instant), "offPeak");
});

test("getPricingPeriod applies holidays by local date", () => {
  // 2026-11-23T16:30Z is already 2026-11-24 00:30 in Shanghai.
  const instant = new Date("2026-11-23T16:30:00Z");

  assert.equal(
    getPricingPeriod(config("UTC", ["2026-11-23"]), instant),
    "offPeak",
  );
  assert.equal(
    getPricingPeriod(config("Asia/Shanghai", ["2026-11-24"]), instant),
    "offPeak",
  );
});

test("getPeriodLabel renders both periods", () => {
  assert.equal(getPeriodLabel("peak"), "PEAK");
  assert.equal(getPeriodLabel("offPeak"), "OFF-PEAK");
});
