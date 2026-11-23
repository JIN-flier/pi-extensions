import assert from "node:assert/strict";
import test from "node:test";

import { validateConfig } from "../src/config.ts";

import type { AutoModelConfig } from "../src/types.ts";

function raw(overrides: Record<string, unknown> = {}): unknown {
  return {
    timeZone: "Asia/Shanghai",
    promptOnNewSession: true,
    promptOnStartup: false,
    holidays: ["2026-11-23"],
    plans: {
      peak: {
        high: { provider: "anthropic", id: "claude-sonnet-4", thinking: "high" },
      },
      offPeak: {
        low: { provider: "anthropic", id: "claude-haiku-4", thinking: "low" },
      },
    },
    ...overrides,
  };
}

test("validateConfig accepts a full configuration and keeps tier names", () => {
  const config = validateConfig(raw());

  assert.deepEqual(Object.keys(config.plans.peak), ["high"]);
  assert.deepEqual(Object.keys(config.plans.offPeak), ["low"]);
  assert.equal(config.plans.peak.high.provider, "anthropic");
  assert.equal(config.plans.offPeak.low.thinking, "low");
  assert.deepEqual(config.holidays, ["2026-11-23"]);
});

test("validateConfig applies defaults for optional fields", () => {
  const config = validateConfig({
    plans: { peak: {}, offPeak: {} },
  }) as AutoModelConfig;

  assert.equal(config.timeZone, "Asia/Shanghai");
  assert.equal(config.promptOnNewSession, false);
  assert.equal(config.promptOnStartup, false);
  assert.deepEqual(config.holidays, []);
});

test("validateConfig trims provider and model ids", () => {
  const config = validateConfig(
    raw({
      plans: {
        peak: {
          high: { provider: "  anthropic ", id: " claude-sonnet-4 ", thinking: "high" },
        },
        offPeak: {},
      },
    }),
  );

  assert.equal(config.plans.peak.high.provider, "anthropic");
  assert.equal(config.plans.peak.high.id, "claude-sonnet-4");
});

test("validateConfig rejects an unknown thinking level", () => {
  assert.throws(
    () =>
      validateConfig(
        raw({
          plans: {
            peak: { high: { provider: "anthropic", id: "x", thinking: "turbo" } },
            offPeak: {},
          },
        }),
      ),
    /plans\.peak\.high\.thinking has an invalid value/,
  );
});

test("validateConfig rejects malformed structures", () => {
  assert.throws(() => validateConfig(null), /Configuration must be an object/);
  assert.throws(() => validateConfig(raw({ plans: undefined })), /plans must be an object/);
  assert.throws(
    () => validateConfig(raw({ plans: { peak: [], offPeak: {} } })),
    /plans\.peak must be an object/,
  );
  assert.throws(
    () => validateConfig(raw({ plans: { peak: { high: {} }, offPeak: {} } })),
    /plans\.peak\.high\.provider must be a non-empty string/,
  );
});

test("validateConfig rejects invalid time zones and holidays", () => {
  assert.throws(() => validateConfig(raw({ timeZone: "Mars/Olympus" })), /Invalid timeZone/);
  assert.throws(() => validateConfig(raw({ holidays: ["2026-13-01"] })), /holidays\[0\] must be YYYY-MM-DD/);
  assert.throws(() => validateConfig(raw({ holidays: "2026-11-23" })), /holidays must be an array/);
});

test("validateConfig rejects non-boolean prompt flags", () => {
  assert.throws(
    () => validateConfig(raw({ promptOnNewSession: "yes" })),
    /promptOnNewSession must be a boolean/,
  );
});
