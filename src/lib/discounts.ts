// Shared pure discount rules (browser + server).
export const ACCOUNT_DISCOUNT = 5;
export const PROFILE_DISCOUNT = 5;

export const normalizeCode = (code: string) => code.trim().toUpperCase();
export const codePattern = /^[A-Z0-9_-]{2,40}$/;

/**
 * Calcule le pourcentage total :
 * - Les réductions de bienvenue (compte 5 % + profil 5 %) ne s'appliquent qu'à la 1ère commande.
 * - S'il a déjà commandé (isFirstOrder = false), seuls les codes promo s'appliquent.
 */
export function totalPercent(account: boolean, codePercent: number, profileComplete = false, isFirstOrder = true) {
  const accountPct = account && isFirstOrder ? ACCOUNT_DISCOUNT : 0;
  const profilePct = profileComplete && isFirstOrder ? PROFILE_DISCOUNT : 0;
  return Math.min(100, accountPct + profilePct + Math.max(0, codePercent));
}

export function applyDiscount(total: number | null, percent: number) {
  if (total === null) return null;
  return Math.round(total * (1 - percent / 100) * 100) / 100;
}
