// utils/toCSV.ts
export type Cell = {
  est?: number;
  tracked?: number;
  estLocked?: boolean;
};

export type Row = {
  project: string;
  cells: Record<number, Cell>;
};

export type Data = {
  rows: Row[];
};

export type ViewMode = "week" | "month";

// helper formatters
const fmt = (n: number | string) =>
  typeof n === "number" && !Number.isNaN(n) ? n.toString() : String(n ?? "");

// Escape CSV cells
const csvEscape = (val: string) => {
  return /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
};

/**
 * Convert timesheet data to CSV
 */
export function toCSV({
  viewMode,
  data,
  weekStart,
  getActiveIdentity,
  keyFor,
  weeksInMonth,
}: {
  viewMode: ViewMode;
  data: Data;
  weekStart: Date;
  getActiveIdentity: () => { username: string; role: string };
  keyFor: (who: { username: string; role: string }, date: Date) => string;
  weeksInMonth: (year: number, month: number) => Date[];
}): string {
  if (viewMode === "week") {
    const header = [
      "Project",
      ...["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((lbl) => [
        `${lbl} Est`,
        `${lbl} Tracked`,
      ]),
      "Total Est (Week)",
      "Total Tracked (Week)",
    ];
    const rows: (string | number)[][] = [header];

    (data.rows || []).forEach((row) => {
      let rowEst = 0,
        rowTrk = 0;
      const r: (string | number)[] = [row.project || ""];
      for (let d = 0; d < 5; d++) {
        const c = row.cells?.[d] || {};
        const e = Number(c.est || 0),
          t = Number(c.tracked || 0);
        r.push(c.est ?? "", c.tracked ?? "");
        rowEst += e;
        rowTrk += t;
      }
      r.push(fmt(rowEst), fmt(rowTrk));
      rows.push(r);
    });

    return rows
      .map((r) => r.map((cell) => csvEscape(String(cell ?? ""))).join(","))
      .join("\n");
  } else {
    const y = weekStart.getFullYear();
    const m = weekStart.getMonth();
    const mondays = weeksInMonth(y, m);
    const who = getActiveIdentity();

    const header = [
      "Project",
      ...mondays.map((_, i) => `Week ${i + 1} Est`),
      ...mondays.map((_, i) => `Week ${i + 1} Tracked`),
      "Total Est (Month)",
      "Total Tracked (Month)",
    ];
    const rows: (string | number)[][] = [header];

    // union of projects across all mondays
    const projectSet = new Set<string>();
    mondays.forEach((mon) => {
      const raw = localStorage.getItem(keyFor(who, mon));
      const obj = raw ? JSON.parse(raw) : { rows: [] };
      (obj.rows || []).forEach((r: Row) =>
        projectSet.add((r.project || "").trim())
      );
    });
    const projects = Array.from(
      projectSet.size ? projectSet : new Set([""])
    );

    projects.forEach((projectName) => {
      const estWeeks: string[] = [];
      const trkWeeks: string[] = [];

      mondays.forEach((mon) => {
        const raw = localStorage.getItem(keyFor(who, mon));
        const obj = raw ? JSON.parse(raw) : { rows: [] };
        const row = (obj.rows || []).find(
          (r: Row) => (r.project || "") === projectName
        );
        let we = 0,
          wt = 0;
        for (let d = 0; d < 5; d++) {
          const c = row?.cells?.[d];
          if (!c) continue;
          we += Number(c.est || 0);
          wt += Number(c.tracked || 0);
        }
        estWeeks.push(fmt(we));
        trkWeeks.push(fmt(wt));
      });

      const totalEst = estWeeks.map(Number).reduce((a, b) => a + b, 0);
      const totalTrk = trkWeeks.map(Number).reduce((a, b) => a + b, 0);

      rows.push([
        projectName || "",
        ...estWeeks,
        ...trkWeeks,
        fmt(totalEst),
        fmt(totalTrk),
      ]);
    });

    return rows
      .map((r) => r.map((cell) => csvEscape(String(cell ?? ""))).join(","))
      .join("\n");
  }
}