// src/lib/date.ts
export type ISODate = string; // 'YYYY-MM-DD'

export function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmt(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function getMonthWeeks(anchor: Date) {
  // Return 5–6 weeks that intersect the month of anchor
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const firstWeekStart = startOfWeek(first);
  const weeks: Date[] = [];
  for (let w = 0; w < 6; w++) {
    const candidate = addDays(firstWeekStart, w * 7);
    // include week if any day is in target month or it's necessary to show the tailing days
    const anyInMonth = [...Array(7)].some((i, idx) => addDays(candidate, idx).getMonth() === anchor.getMonth());
    if (anyInMonth || weeks.length === 0) weeks.push(candidate);
  }
  // Trim trailing week with no days in month (prevents overlap/extra)
  const last = weeks[weeks.length - 1];
  const lastInMonth = [...Array(7)].some((_, idx) => addDays(last, idx).getMonth() === anchor.getMonth());
  if (!lastInMonth) weeks.pop();
  return weeks;
}
