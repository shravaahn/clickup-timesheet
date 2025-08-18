"use client";

import { useState } from "react";

export default function ViewButtons() {
  const [viewMode, setViewMode] = useState("week"); // default = week

  return (
    <div className="space-y-4">
      {/* Buttons */}
      <div className="flex gap-4">
        <button
          className={`px-4 py-2 rounded ${
            viewMode === "week" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
          onClick={() => setViewMode("week")}
        >
          Week
        </button>
        <button
          className={`px-4 py-2 rounded ${
            viewMode === "month" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
          onClick={() => setViewMode("month")}
        >
          Month
        </button>
      </div>

      {/* Labels */}
      <div className="space-y-2">
        <p id="periodLabel">
          Period: {viewMode === "week" ? "Week" : "Month"}
        </p>
        <p id="kpiEstLabel">
          Total Est Hours ({viewMode === "week" ? "Week" : "Month"})
        </p>
        <p id="kpiTrackedLabel">
          Total Tracked Hours ({viewMode === "week" ? "Week" : "Month"})
        </p>
        <h2 id="dailyChartTitle" className="font-semibold">
          {viewMode === "week"
            ? "Daily Totals (Est vs Tracked) — Week"
            : "Weekly Totals (Est vs Tracked) — Month"}
        </h2>
      </div>
    </div>
  );
}
