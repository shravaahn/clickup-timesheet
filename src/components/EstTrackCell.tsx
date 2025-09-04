// src/components/EstTrackCell.tsx
"use client";

type Props = {
  estValue: number | null;
  estLocked?: boolean;
  onEstChange?: (value: number | null) => void;

  trackedValue: number | null;
  trackedLabel?: string; // e.g., "Track" when null or `${n}h` when set
  onOpenTrack?: () => void;

  disabled?: boolean;
};

/**
 * A compact, no-overlap cell:
 * - 64px wide total, always fits even on small screens
 * - Est (tiny input/badge) on top
 * - Track button under it
 * - Uses grid + fixed sizes to avoid wrapping/overlap
 */
export default function EstTrackCell({
  estValue,
  estLocked,
  onEstChange,
  trackedValue,
  trackedLabel,
  onOpenTrack,
  disabled,
}: Props) {
  const label = trackedLabel ?? (trackedValue != null ? `${trackedValue}h` : "Track");

  return (
    <div
      className="
        mx-auto grid w-[72px] grid-rows-[28px_28px] gap-1
      "
    >
      {/* Est */}
      <input
        disabled={disabled || estLocked}
        value={estValue ?? ""}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (!onEstChange) return;
          if (raw === "") onEstChange(null);
          else onEstChange(Number(raw));
        }}
        placeholder="Est"
        className={`
          h-[28px] w-full rounded-md
          border border-[var(--border)]
          bg-[var(--input)] text-[11px] text-center
          text-[var(--text)] outline-none
          ${estLocked ? "opacity-70" : ""}
        `}
      />

      {/* Track */}
      <button
        type="button"
        disabled={disabled}
        onClick={onOpenTrack}
        className="
          h-[28px] w-full rounded-md
          bg-[#3b82f6] text-[11px] font-semibold text-white
          hover:brightness-110 transition
          disabled:opacity-60
        "
        title="Track time"
      >
        {label}
      </button>
    </div>
  );
}
