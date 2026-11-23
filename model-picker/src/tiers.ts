/**
 * 档位（tier）不是固定枚举：它们由配置文件里 `plans.<period>` 的键决定，
 * 所以这里只提供「从配置推导档位」的纯函数，不再维护一份写死的列表。
 */
import type { AutoModelConfig, Tier, TierPlan } from "./types.ts";

/** 某个时段可用的档位，顺序与配置文件里的书写顺序一致。 */
export function getTiers(plan: TierPlan): Tier[] {
  return Object.keys(plan);
}

/**
 * 全部已配置的档位：peak 的顺序优先，只在 offPeak 出现的档位追加在后。
 * 用于 `/model-picker <tier>` 这类不区分时段的入口。
 */
export function getConfiguredTiers(config: AutoModelConfig): Tier[] {
  const tiers = getTiers(config.plans.peak);

  for (const tier of getTiers(config.plans.offPeak)) {
    if (!tiers.includes(tier)) {
      tiers.push(tier);
    }
  }

  return tiers;
}

/** 按名字查档位（大小写、首尾空白不敏感），返回配置中的原始写法。 */
export function findTier(
  config: AutoModelConfig,
  name: string,
): Tier | undefined {
  const wanted = name.trim().toLowerCase();

  if (!wanted) {
    return undefined;
  }

  return getConfiguredTiers(config).find(
    (tier) => tier.toLowerCase() === wanted,
  );
}
