"use client"; // required if you're in Next.js 13+ app directory

import { useEffect, useState } from "react";

type Row = {
  id: string;
  value: string;
  // add more fields as needed
};

type Data = {
  rows: Row[];
};

const STORAGE_PREFIX = "time-tracker"; // you can modify this
const weekStart = "2025-08-17"; // example, better to compute dynamically

// Helper to build keys
function keyFor(identity: string, week: string) {
  return `${STORAGE_PREFIX}_${identity}_${week}`;
}

// Example identity getter (replace with real one)
function getActiveIdentity(): string {
  return "user1"; // e.g. from auth context
}

export default function PersistenceExample() {
  const [data, setData] = useState<Data>({ rows: [] });

  // Load data on mount
  useEffect(() => {
    const active = getActiveIdentity();
    const raw = localStorage.getItem(keyFor(active, weekStart));
    if (raw) {
      setData(JSON.parse(raw));
    }
  }, []);

  function save() {
    const active = getActiveIdentity();
    localStorage.setItem(keyFor(active, weekStart), JSON.stringify(data));
    updateAllSummaries();
    alert("Saved ✅");
  }

  function saveSilent() {
    const active = getActiveIdentity();
    localStorage.setItem(keyFor(active, weekStart), JSON.stringify(data));
  }

  // Dummy summary updater
  function updateAllSummaries() {
    console.log("Summaries updated:", data);
  }

  return (
    <div className="p-4">
      <h1 className="font-bold">Persistence Demo</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <button
        onClick={save}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Save
      </button>
      <button
        onClick={saveSilent}
        className="mt-2 ml-2 px-4 py-2 bg-gray-500 text-white rounded"
      >
        Save (Silent)
      </button>
    </div>
  );
}
