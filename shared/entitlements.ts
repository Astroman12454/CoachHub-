// Single source of truth for what a plan is allowed to do. Every plan gate
// in the app — server route guards and client-side UI gating alike — should
// call one of these instead of comparing account.plan inline, so the rules
// live in exactly one place.
import {
  FREE_PLAN_PLAYER_LIMIT,
  FREE_PLAN_TEAM_LIMIT,
  FREE_PLAN_PLAY_LIMIT,
  type Plan,
} from "./schema";

// Club is a superset of Paid (unlimited teams/players/plays, custom
// exercises, AI features) plus multi-coach seats — so everywhere "paid
// features" are gated, Club qualifies too.
export function isPaidPlan(plan: Plan): boolean {
  return plan === "paid" || plan === "club";
}

export function isClubPlan(plan: Plan): boolean {
  return plan === "club";
}

export function canCreateTeam(plan: Plan, currentTeamCount: number): boolean {
  return isPaidPlan(plan) || currentTeamCount < FREE_PLAN_TEAM_LIMIT;
}

export function canCreatePlayer(plan: Plan, currentPlayerCount: number): boolean {
  return isPaidPlan(plan) || currentPlayerCount < FREE_PLAN_PLAYER_LIMIT;
}

export function canCreatePlay(plan: Plan, currentPlayCount: number): boolean {
  return isPaidPlan(plan) || currentPlayCount < FREE_PLAN_PLAY_LIMIT;
}

export function canUseCustomExercises(plan: Plan): boolean {
  return isPaidPlan(plan);
}

export function canGenerateAiSessionPlan(plan: Plan): boolean {
  return isPaidPlan(plan);
}

export function canImportBoxScore(plan: Plan): boolean {
  return isPaidPlan(plan);
}

export function canUseAiHelp(plan: Plan): boolean {
  return isPaidPlan(plan);
}
