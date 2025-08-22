// src/store/timesheet.tsx
'use client';
import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { ISODate } from '@/lib/date';

export type Project = { id: string; name: string; assigneeId: string };
export type Entry = {
  date: ISODate;
  projectId: string;
  est?: number;    // hours
  tracked?: number; // hours
};

type TimesheetState = {
  projects: Project[];
  entries: Entry[];
  upsertEntry: (patch: Entry) => void;
  addProject: (p: Omit<Project, 'id'>) => Project;
};

const TimesheetCtx = createContext<TimesheetState | null>(null);

export function TimesheetProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  const upsertEntry = (patch: Entry) => {
    setEntries((prev) => {
      const i = prev.findIndex(
        (e) => e.date === patch.date && e.projectId === patch.projectId
      );
      if (i === -1) return [...prev, patch];
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  const addProject = (p: Omit<Project, 'id'>) => {
    const proj = { ...p, id: crypto.randomUUID() };
    setProjects((prev) => [...prev, proj]);
    return proj;
  };

  const value = useMemo(() => ({ projects, entries, upsertEntry, addProject }), [projects, entries]);

  return <TimesheetCtx.Provider value={value}>{children}</TimesheetCtx.Provider>;
}

export const useTimesheet = () => {
  const ctx = useContext(TimesheetCtx);
  if (!ctx) throw new Error('useTimesheet must be used inside TimesheetProvider');
  return ctx;
};
