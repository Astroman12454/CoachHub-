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
