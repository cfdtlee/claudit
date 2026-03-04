import { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

type Preset = 'every_n_min' | 'hourly' | 'daily' | 'weekly' | 'custom';

interface Props {
  value: string;
  onChange: (expression: string) => void;
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, day, month, weekday] = parts;

  // Every N minutes
  if (min.startsWith('*/') && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    const n = parseInt(min.slice(2));
    if (!isNaN(n)) return `Every ${n} minute${n === 1 ? '' : 's'}`;
  }

  // Every hour at :min
  if (/^\d+$/.test(min) && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return `Every hour at :${min.padStart(2, '0')}`;
  }

  // Daily at hour:min
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && weekday === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  // Weekly
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && weekday !== '*') {
    const dayNames: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
    const dayRanges: Record<string, string> = { '1-5': 'weekdays', '0,6': 'weekends', '6,0': 'weekends' };
    const dayStr = dayRanges[weekday] || weekday.split(',').map(d => dayNames[d] || d).join(', ');
    return `${dayStr} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  return expr;
}

function detectPreset(expr: string): { preset: Preset; minutes: number; hour: string; minute: string; weekday: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { preset: 'custom', minutes: 30, hour: '9', minute: '0', weekday: '1-5' };
  const [min, hour, day, month, weekday] = parts;

  if (min.startsWith('*/') && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { preset: 'every_n_min', minutes: parseInt(min.slice(2)) || 30, hour: '9', minute: '0', weekday: '1-5' };
  }
  if (/^\d+$/.test(min) && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { preset: 'hourly', minutes: 30, hour: '9', minute: min, weekday: '1-5' };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && weekday === '*') {
    return { preset: 'daily', minutes: 30, hour, minute: min, weekday: '1-5' };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && weekday !== '*') {
    return { preset: 'weekly', minutes: 30, hour, minute: min, weekday };
  }
  return { preset: 'custom', minutes: 30, hour: '9', minute: '0', weekday: '1-5' };
}

export default function CronExpressionBuilder({ value, onChange }: Props) {
  const initial = detectPreset(value);
  const [preset, setPreset] = useState<Preset>(initial.preset);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [weekday, setWeekday] = useState(initial.weekday);
  const [customExpr, setCustomExpr] = useState(value);

  useEffect(() => {
    let expr: string;
    switch (preset) {
      case 'every_n_min':
        expr = `*/${minutes} * * * *`;
        break;
      case 'hourly':
        expr = `${minute} * * * *`;
        break;
      case 'daily':
        expr = `${minute} ${hour} * * *`;
        break;
      case 'weekly':
        expr = `${minute} ${hour} * * ${weekday}`;
        break;
      case 'custom':
        expr = customExpr;
        break;
      default:
        expr = value;
    }
    if (expr !== value) {
      onChange(expr);
    }
  }, [preset, minutes, hour, minute, weekday, customExpr]);

  const presetButtons: { key: Preset; label: string }[] = [
    { key: 'every_n_min', label: 'Every N min' },
    { key: 'hourly', label: 'Hourly' },
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'custom', label: 'Custom' },
  ];

  const selectCls = 'bg-background/80 border border-border rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-all';

  return (
    <div className="space-y-2">
      {/* Preset buttons */}
      <div className="flex gap-1 flex-wrap">
        {presetButtons.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-full transition-all font-medium',
              preset === p.key
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Preset-specific inputs */}
      <div className="flex items-center gap-2 flex-wrap">
        {preset === 'every_n_min' && (
          <>
            <span className="text-xs text-muted-foreground">Every</span>
            <select
              value={minutes}
              onChange={e => setMinutes(parseInt(e.target.value))}
              className={selectCls}
            >
              {[1, 2, 5, 10, 15, 20, 30, 45, 60].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">minutes</span>
          </>
        )}

        {preset === 'hourly' && (
          <>
            <span className="text-xs text-muted-foreground">At minute</span>
            <select
              value={minute}
              onChange={e => setMinute(e.target.value)}
              className={selectCls}
            >
              {[0, 5, 10, 15, 20, 30, 45].map(n => (
                <option key={n} value={n}>{`:${String(n).padStart(2, '0')}`}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">of every hour</span>
          </>
        )}

        {(preset === 'daily' || preset === 'weekly') && (
          <>
            <span className="text-xs text-muted-foreground">At</span>
            <input
              type="time"
              value={`${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`}
              onChange={e => {
                const [h, m] = e.target.value.split(':');
                setHour(String(parseInt(h)));
                setMinute(String(parseInt(m)));
              }}
              className={selectCls}
            />
          </>
        )}

        {preset === 'weekly' && (
          <>
            <span className="text-xs text-muted-foreground">on</span>
            <select
              value={weekday}
              onChange={e => setWeekday(e.target.value)}
              className={selectCls}
            >
              <option value="1-5">Weekdays (Mon-Fri)</option>
              <option value="0,6">Weekends</option>
              <option value="*">Every day</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </select>
          </>
        )}

        {preset === 'custom' && (
          <input
            type="text"
            value={customExpr}
            onChange={e => setCustomExpr(e.target.value)}
            className="flex-1 bg-background/80 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            placeholder="*/30 * * * *"
          />
        )}
      </div>

      {/* Human-readable description */}
      <div className="text-xs text-muted-foreground">
        {describeCron(value)}
        {preset !== 'custom' && (
          <span className="ml-2 text-muted-foreground/50 font-mono">{value}</span>
        )}
      </div>
    </div>
  );
}
