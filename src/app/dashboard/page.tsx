// src/app/dashboard/page.tsx
'use client';
import { useMemo, useState } from 'react';
import { Button, Group, Select } from '@mantine/core';
import AddProjectModal from '@/components/AddProjectModal';
import MonthView from '@/components/MonthView';
import WeekView from '@/components/WeekView';
import { TimesheetProvider } from '@/store/timesheet';

export default function DashboardPage() {
  const [view, setView] = useState<'week' | 'month'>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);

  // In your real app, populate these from session/user API:
  const currentUserId = 'me';
  const currentUserName = 'Sahukara Shravan Kumar';

  const weekLabel = useMemo(() => {
    const d = new Date(anchor);
    const monday = new Date(d);
    const day = (d.getDay() + 6) % 7;
    monday.setDate(d.getDate() - day);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }, [anchor]);

  return (
    <TimesheetProvider>
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <img src="/icon.png" alt="Logo" className="h-7 w-7 rounded-md" />
          <div className="text-lg font-semibold">Time Tracking</div>
          <div className="ml-auto flex items-center gap-2">
            <Select
              data={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]}
              value={view}
              onChange={(v) => v && setView(v as any)}
              className="w-[120px]"
            />
            <Button variant="subtle" onClick={() => setAnchor((d) => new Date(d.setDate(d.getDate() - 7)))}>◀ Prev</Button>
            <Button variant="subtle" onClick={() => setAnchor(new Date())}>This {view === 'week' ? 'Week' : 'Month'}</Button>
            <Button variant="subtle" onClick={() => setAnchor((d) => new Date(d.setDate(d.getDate() + 7)))}>Next ▶</Button>
            <Button onClick={() => setModalOpen(true)}>+ Add Project</Button>
          </div>
        </div>

        {/* Filters row */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-divider/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">Selected</div>
            <div className="text-sm font-medium">{view === 'week' ? `Week: ${weekLabel}` : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
          </div>
          <div className="rounded-xl border border-divider/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">User</div>
            <div className="text-sm font-medium">{currentUserName}</div>
          </div>
          <div className="rounded-xl border border-divider/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">Period</div>
            <div className="text-sm font-medium capitalize">{view}</div>
          </div>
        </div>

        {/* Main content */}
        {view === 'week' ? <WeekView anchor={anchor} /> : <MonthView monthAnchor={anchor} />}

        {/* Modal */}
        <AddProjectModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      </div>
    </TimesheetProvider>
  );
}
