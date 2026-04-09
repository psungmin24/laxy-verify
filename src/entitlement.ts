/**
 * Fetches paid plan entitlements for laxy-verify.
 *
 * The CLI asks /api/v1/cli-entitlement for the current plan and enabled features.
 * Responses are cached briefly to avoid repeated network calls during a single run.
 * If the request fails or the user is not logged in, the CLI safely falls back to Free.
 */
import { loadToken, LAXY_API_URL } from "./auth.js";

export interface EntitlementFeatures {
  plan: string;
  gold_grade: boolean;
  lighthouse_runs_3: boolean;
  verbose_failure: boolean;
  multi_viewport: boolean;
  failure_analysis: boolean;
  fast_lane: boolean;
}

const FREE_FEATURES: EntitlementFeatures = {
  plan: "free",
  gold_grade: false,
  lighthouse_runs_3: false,
  verbose_failure: false,
  multi_viewport: false,
  failure_analysis: false,
  fast_lane: false,
};

let cache: { features: EntitlementFeatures; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PLAN_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  pro_plus: 2,
  team: 2,
  enterprise: 2,
};

export type TestablePlan = "free" | "pro" | "pro_plus";

export function normalizePlan(plan?: string | null): TestablePlan {
  if (plan === "pro") return "pro";
  if (plan === "pro_plus" || plan === "team" || plan === "enterprise") return "pro_plus";
  return "free";
}

function getPlanRank(plan?: string | null): number {
  return PLAN_RANK[plan ?? "free"] ?? 0;
}

export async function getEntitlements(): Promise<EntitlementFeatures> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.features;
  }

  const token = loadToken();
  if (!token) return FREE_FEATURES;

  try {
    const res = await fetch(`${LAXY_API_URL}/api/v1/cli-entitlement`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        console.error(
          "  Note: your CLI session is no longer valid. Run laxy-verify login again to refresh your paid entitlements."
        );
      }
      return FREE_FEATURES;
    }

    const features = (await res.json()) as EntitlementFeatures;
    cache = { features, fetchedAt: Date.now() };
    return features;
  } catch {
    return FREE_FEATURES;
  }
}

export function applyPlanOverride(
  features: EntitlementFeatures,
  overridePlan?: TestablePlan
): EntitlementFeatures {
  if (!overridePlan) return features;

  const actualPlan = normalizePlan(features.plan);
  if (getPlanRank(overridePlan) > getPlanRank(actualPlan)) {
    throw new Error(
      `Plan override "${overridePlan}" is higher than your active entitlement "${actualPlan}". Downgrade overrides are allowed, upgrades are not.`
    );
  }

  if (overridePlan === actualPlan) {
    return { ...features, plan: overridePlan };
  }

  if (overridePlan === "free") {
    return {
      plan: "free",
      gold_grade: false,
      lighthouse_runs_3: false,
      verbose_failure: false,
      multi_viewport: false,
      failure_analysis: false,
      fast_lane: false,
    };
  }

  if (overridePlan === "pro") {
    return {
      plan: "pro",
      gold_grade: false,
      lighthouse_runs_3: true,
      verbose_failure: features.verbose_failure,
      multi_viewport: false,
      failure_analysis: false,
      fast_lane: false,
    };
  }

  return { ...features, plan: "pro_plus" };
}

export function printPlanBanner(features: EntitlementFeatures): void {
  const planLabels: Record<string, string> = {
    free: "Free",
    pro: "Pro",
    pro_plus: "Pro+",
    team: "Team",
    enterprise: "Enterprise",
  };
  const label = planLabels[features.plan] ?? features.plan;
  if (features.plan !== "free") {
    console.log(`  Plan: ${label}`);
  }
}
