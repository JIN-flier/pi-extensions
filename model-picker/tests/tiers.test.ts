import assert from "node:assert/strict";
import test from "node:test";

import { findTier, getConfiguredTiers, getTiers } from "../src/tiers.ts";

import type { AutoModelConfig, ModelChoice } from "../src/types.ts";

function choice(id = "claude-sonnet-4"): ModelChoice {
  return { provider: "anthropic", id, thinking: "high" };
}

function config(
  peak: Record<string, ModelChoice>,
  offPeak: Record<string, ModelChoice>,
): AutoModelConfig {
  return {
    timeZone: "Asia/Shanghai",
    promptOnNewSession: false,
    promptOnStartup: false,
    holidays: [],
    plans: { peak, offPeak },
  };
}

test("getTiers keeps the order the configuration declares", () => {
  const peak = { low: choice("a"), high: choice("b"), max: choice("c") };

  assert.deepEqual(getTiers(peak), ["low", "high", "max"]);
  assert.deepEqual(getTiers({}), []);
});

test("getConfiguredTiers lists peak tiers first, then off-peak extras", () => {
  const cfg = config(
    { high: choice(), low: choice() },
    { high: choice(), low: choice(), weekend: choice() },
  );

  assert.deepEqual(getConfiguredTiers(cfg), ["high", "low", "weekend"]);
});

test("getConfiguredTiers does not invent tiers missing from both periods", () => {
  assert.deepEqual(getConfiguredTiers(config({}, {})), []);
});

test("findTier matches case-insensitively and returns the configured spelling", () => {
  const cfg = config({ High: choice() }, {});

  assert.equal(findTier(cfg, "high"), "High");
  assert.equal(findTier(cfg, "  HIGH  "), "High");
  assert.equal(findTier(cfg, "low"), undefined);
  assert.equal(findTier(cfg, ""), undefined);
});

test("findTier finds a tier that only exists off-peak", () => {
  const cfg = config({ high: choice() }, { weekend: choice() });

  assert.equal(findTier(cfg, "weekend"), "weekend");
});
