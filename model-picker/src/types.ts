import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// ============================================================
// Basic Types
// ============================================================

/** 档位名来自配置文件的键，没有固定枚举，所以就是普通字符串。 */
export type Tier = string;

export type PricingPeriod = "peak" | "offPeak";

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

// ============================================================
// Model Configuration
// ============================================================

export interface ModelChoice {
  provider: string;
  id: string;
  thinking: ThinkingLevel;
}

export type TierPlan = Record<Tier, ModelChoice>;

export interface AutoModelConfig {
  timeZone: string;

  promptOnNewSession: boolean;
  promptOnStartup: boolean;

  holidays: string[];

  plans: Record<PricingPeriod, TierPlan>;
}

// ============================================================
// Shared Context
// ============================================================

export type ModelContext = ExtensionContext;
