// "14:05" + 95 minutes -> "3:40 PM" — clock time is far more readable than
// a raw offset once a coach is looking at a run-of-show for practice.
// Shared between SessionTimeline (on-screen) and the session-plan PDF
// export, so both compute the exact same schedule.
export function addMinutesToClock(startTime: string, minutes: number): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  if (!match) return null;
  const totalMinutes = (parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + minutes) % (24 * 60);
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

// Plain "YYYY-MM-DD" dates (no time/zone info) need a forced local-midnight
// parse — `new Date("2026-08-08")` parses as UTC midnight, which
// `toLocaleDateString` can then roll back a day in timezones behind UTC.
export function formatPlainDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A full timestamp (ISO string with time, e.g. a notification or comment's
// createdAt) as "Aug 14, 3:40 PM" — shared by every dialog that lists
// timestamped social activity (notifications, exercise/play/physical-test
// comments).
export function formatTimestamp(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}


// Whole years elapsed since a "YYYY-MM-DD" birth date, as of today — the
// naive `currentYear - birthYear` is off by one for anyone whose birthday
// hasn't happened yet this calendar year, so this checks month/day too.
// Parsed at local noon (not midnight) so the date itself never shifts a
// day from timezone rounding, the same class of bug formatPlainDate below
// guards against for other plain-date fields.
export function calculateAge(birthDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const today = new Date();
  let age = today.getFullYear() - year;
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasHadBirthdayThisYear) age -= 1;

  return age >= 0 ? age : null;
}
