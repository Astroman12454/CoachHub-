// Spain's LOPDGDD art. 7 fixes the digital age of consent at 14 (GDPR art. 8
// leaves it to each member state, 13-16); this app is Spain-first, so 14 is
// the threshold used to decide whether a player's data needs guardian
// authorization for sensitive categories (see shared/schema.ts CONSENT_PURPOSES).
export const MINOR_AGE_THRESHOLD = 14;

// birthDate is the same plain "YYYY-MM-DD" text every date on the player
// schema uses. A player with no birth date on file is treated as NOT a
// minor — a coach entering an adult team's roster shouldn't get blocked by
// a field they have no reason to fill in, and a false negative here just
// means the existing UI hint (see PlayerForm) still tells them to get
// consent before recording anything sensitive.
export function isMinor(birthDate: string | null | undefined, today: Date = new Date()): boolean {
  if (!birthDate) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return false;
  const [, y, m, d] = match;
  const birth = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(birth.getTime())) return false;

  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age < MINOR_AGE_THRESHOLD;
}
