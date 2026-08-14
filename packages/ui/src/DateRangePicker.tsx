import React, { useId } from 'react';
import { Button } from './Button.js';
import { cn } from './cn.js';

export interface DateRangeValue {
  /** YYYY-MM-DD, '' allowed for an open side. */
  from: string;
  /** YYYY-MM-DD, '' allowed for an open side. */
  to: string;
}

export interface DateRangePreset {
  label: string;
  range: DateRangeValue;
}

export interface DateRangePickerProps {
  value?: DateRangeValue;
  /** undefined when both sides cleared. */
  onChange: (next: DateRangeValue | undefined) => void;
  /** Defaults to Today / Last 7 days / This month. */
  presets?: DateRangePreset[];
  className?: string;
}

/** Local YYYY-MM-DD (never UTC/toISOString) from a Date's local fields. */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today / Last 7 days / This month, all in LOCAL time. */
export function defaultDateRangePresets(): DateRangePreset[] {
  const today = new Date();
  const todayYmd = toYmd(today);

  const sevenAgo = new Date(today);
  sevenAgo.setDate(today.getDate() - 6); // inclusive 7-day window

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return [
    { label: 'Today', range: { from: todayYmd, to: todayYmd } },
    { label: 'Last 7 days', range: { from: toYmd(sevenAgo), to: todayYmd } },
    { label: 'This month', range: { from: toYmd(firstOfMonth), to: todayYmd } },
  ];
}

const fieldClass =
  'w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent';

/** A structured date-range control: presets + From/To native date inputs + Clear. */
export function DateRangePicker({
  value,
  onChange,
  presets = defaultDateRangePresets(),
  className,
}: DateRangePickerProps): React.JSX.Element {
  const fromId = useId();
  const toId = useId();
  const from = value?.from ?? '';
  const to = value?.to ?? '';
  const hasValue = from !== '' || to !== '';

  function emit(next: DateRangeValue) {
    if (next.from === '' && next.to === '') {
      onChange(undefined);
    } else {
      onChange(next);
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(preset.range)}
          >
            {preset.label}
          </Button>
        ))}
        {hasValue && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Clear
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fromId} className="text-sm font-medium text-text">
            From
          </label>
          <input
            id={fromId}
            type="date"
            value={from}
            className={fieldClass}
            onChange={(e) => emit({ from: e.target.value, to })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={toId} className="text-sm font-medium text-text">
            To
          </label>
          <input
            id={toId}
            type="date"
            value={to}
            className={fieldClass}
            onChange={(e) => emit({ from, to: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
