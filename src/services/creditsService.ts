import { getBackendUrl } from '../lib/backendUrl';

const BACKEND_URL = getBackendUrl();

export interface CreditInfo {
  credits: number;
  is_pro: boolean;
  plan_generations_used: number;
  coach_chats_used: number;
}

export interface CreditCheckResult {
  can_access: boolean;
  credits: number;
  cost?: number;
  needed?: number;
  free_used?: number;
  free_limit?: number;
  in_free_limit?: boolean;
  is_pro?: boolean;
}

export interface DeductResult {
  success: boolean;
  remaining: number;
  deducted: number;
  error?: string;
  free_used?: number;
  free_limit?: number;
  is_pro?: boolean;
}

// Feature costs
export const FEATURE_COSTS: Record<string, number> = {
  deep_think: 5,
  agent_mode: 5,
  max_deep_think: 10,
  generate_plan: 3,
  coach_chat: 1,
  locked_exercise: 2,
};

// Free limits
export const FREE_LIMITS: Record<string, number> = {
  generate_plan: 10,
  coach_chat: 10,
};

/**
 * Get user's credit balance
 */
export async function getUserCredits(userId: string): Promise<CreditInfo | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/credits/${userId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error getting credits:', error);
    return null;
  }
}

/**
 * Check if user can access a premium feature
 */
export async function checkFeatureAccess(userId: string, feature: string): Promise<CreditCheckResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/credits/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, feature })
    });
    if (!response.ok) {
      return { can_access: true, credits: 100 }; // Default allow on error
    }
    return await response.json();
  } catch (error) {
    console.error('Error checking feature access:', error);
    return { can_access: true, credits: 100 };
  }
}

/**
 * Deduct credits for using a feature
 */
export async function deductCredits(userId: string, feature: string): Promise<DeductResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/credits/deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, feature })
    });
    if (!response.ok) {
      return { success: true, remaining: 100, deducted: 0 };
    }
    return await response.json();
  } catch (error) {
    console.error('Error deducting credits:', error);
    return { success: true, remaining: 100, deducted: 0 };
  }
}

/**
 * Add credits (after payment)
 */
export async function addCredits(userId: string, credits: number): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/credits/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, credits })
    });
    return response.ok;
  } catch (error) {
    console.error('Error adding credits:', error);
    return false;
  }
}

/**
 * Reset free usage limits
 */
export async function resetFreeLimits(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/user/reset-limits/${userId}`, {
      method: 'POST'
    });
    return response.ok;
  } catch (error) {
    console.error('Error resetting limits:', error);
    return false;
  }
}

/**
 * Get feature cost display text
 */
export function getFeatureCostText(feature: string): string {
  const cost = FEATURE_COSTS[feature];
  if (!cost) return 'Free';
  
  const freeLimit = FREE_LIMITS[feature];
  if (freeLimit) {
    return `${freeLimit} free, then ${cost} credits each`;
  }
  
  return `${cost} credits`;
}