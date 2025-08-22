// src/components/MonthView.tsx
'use client';
import { addDays, fmt, getMonthWeeks } from '@/lib/date';
import { useTimesheet } from '@/store/timesheet';
import { useMemo } from 'react';

export default function MonthView({ monthAnchor }: { monthAnchor: Date }) {
  const { entries } = useTimesheet();

  const weeks = useMemo(() => getMonthWeeks(monthAnchor), [monthAnchor]);
  const dayTotals = useMemo(() => {
    const map = new Map<string, { est: number; tracked: number }>();
    for (const e of entries) {
      const cur = map.get(e.date) ?? { est: 0, tracked: 0 };
      map.set(e.date, {
        est: cur.est + (e.est ?? 0),
        tracked: cur.tracked + (e.tracked ?? 0),
      });
    }
    return map;
  }, [entries]);

  return (
    <div className="rounded-2xl border border-divider/40 bg-card p-4">
      <div className="overflow-x-auto">
        <div className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-4 min-w-full">
          {weeks.map((weekStart) => (
            <WeekCard key={weekStart.toISOString()} titleLabel={weekStart} totals={dayTotals} weekStart={weekStart} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekCard({
  weekStart,
  titleLabel,
  totals,
}: {
  weekStart: Date;
  titleLabel: Date;
  totals: Map<string, { est: number; tracked: number }>;
}) {
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  return (
    <div className="rounded-xl border border-divider/40 bg-muted/10 p-3">
      <div className="mb-2 text-sm font-semibold text-foreground/90">
        Week {getWeekNumber(weekStart)} <span className="text-muted-foreground ml-1">{labelMonthIfBoundary(days)}</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const k = fmt(d);
          const t = totals.get(k) ?? { est: 0, tracked: 0 };
          return (
            <div
              key={k}
              className="rounded-lg border border-divider/40 bg-background/60 p-2 text-center"
              title={d.toDateString()}
            >
              <div className="text-xs text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div className="text-sm font-medium">{d.getDate()}</div>
              <div className="mt-2 text-[11px]">
                <div className="opacity-80">Est: {t.est.toFixed(2)}h</div>
                <div>Trk: {t.tracked.toFixed(2)}h</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getWeekNumber(d: Date) {
  // ISO week number (Mon first)
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

function labelMonthIfBoundary(days: Date[]) {
  const months = new Set(days.map((d) => d.toLocaleString(undefined, { month: 'short' })));
  return months.size > 1 ? [...months].join(' / ') : '';
}
