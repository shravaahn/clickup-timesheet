// src/components/WeekView.tsx
'use client';
import { addDays, fmt, startOfWeek } from '@/lib/date';
import { useTimesheet } from '@/store/timesheet';
import { useMemo } from 'react';

export default function WeekView({ anchor }: { anchor: Date }) {
  const { projects, entries, upsertEntry } = useTimesheet();

  const weekDays = useMemo(() => {
    const s = startOfWeek(anchor);
    return [...Array(7)].map((_, i) => addDays(s, i));
  }, [anchor]);

  const onChange = (date: Date, projectId: string, kind: 'est' | 'tracked', value: string) => {
    const hours = Number(value) || 0;
    const key = fmt(date);
    const patch = { date: key, projectId, [kind]: hours } as any;
    upsertEntry(patch);
  };

  return (
    <div className="rounded-2xl border border-divider/40 bg-card p-4">
      <div className="grid grid-cols-[240px_repeat(7,minmax(96px,1fr))] gap-3">
        <div />
        {weekDays.map((d) => (
          <div key={d.toISOString()} className="text-center text-sm text-muted-foreground">
            {d.toLocaleDateString(undefined, { weekday: 'short' })} <span className="text-foreground/80">{d.getDate()}</span>
          </div>
        ))}

        {projects.map((p) => (
          <Row
            key={p.id}
            name={p.name}
            days={weekDays}
            onChange={onChange}
            current={(date) => entries.find((e) => e.projectId === p.id && e.date === fmt(date))}
            projectId={p.id}
          />
        ))}

        {projects.length === 0 && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No projects yet. Click <span className="font-semibold">+ Add Project</span> to begin.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  name,
  days,
  projectId,
  current,
  onChange,
}: {
  name: string;
  days: Date[];
  projectId: string;
  current: (d: Date) => { est?: number; tracked?: number } | undefined;
  onChange: (d: Date, projectId: string, kind: 'est' | 'tracked', value: string) => void;
}) {
  return (
    <>
      <div className="self-center pl-2 text-sm font-medium text-foreground/90">{name}</div>
      {days.map((d) => {
        const cur = current(d);
        return (
          <div key={d.toISOString()} className="space-y-2">
            <input
              className="ts-input"
              placeholder="Est"
              inputMode="decimal"
              defaultValue={cur?.est ?? ''}
              onBlur={(e) => onChange(d, projectId, 'est', e.currentTarget.value)}
            />
            <input
              className="ts-input"
              placeholder="Trk"
              inputMode="decimal"
              defaultValue={cur?.tracked ?? ''}
              onBlur={(e) => onChange(d, projectId, 'tracked', e.currentTarget.value)}
            />
          </div>
        );
      })}
    </>
  );
}
