import { cn } from '../lib/utils';

export type StatusType = 'running' | 'success' | 'error' | 'warning' | 'idle' | 'enabled' | 'disabled' | 'done' | 'synced' | 'local_modified' | 'sync_error';

const statusStyles: Record<StatusType, { dot: string; text: string; bg: string; label: string }> = {
  running:        { dot: 'bg-emerald-400',  text: 'text-emerald-400',  bg: 'bg-emerald-500/10',  label: 'Running' },
  success:        { dot: 'bg-emerald-400',  text: 'text-emerald-400',  bg: 'bg-emerald-500/10',  label: 'Success' },
  error:          { dot: 'bg-red-400',      text: 'text-red-400',      bg: 'bg-red-500/10',      label: 'Error' },
  warning:        { dot: 'bg-amber-400',    text: 'text-amber-400',    bg: 'bg-amber-500/10',    label: 'Warning' },
  done:           { dot: 'bg-amber-400',    text: 'text-amber-400',    bg: 'bg-amber-500/10',    label: 'Done' },
  idle:           { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', bg: 'bg-secondary', label: 'Idle' },
  enabled:        { dot: 'bg-emerald-400',  text: 'text-emerald-400',  bg: 'bg-emerald-500/10',  label: 'ON' },
  disabled:       { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', bg: 'bg-secondary', label: 'OFF' },
  synced:         { dot: 'bg-emerald-400',  text: 'text-emerald-400',  bg: 'bg-emerald-500/10',  label: 'Synced' },
  local_modified: { dot: 'bg-amber-400',    text: 'text-amber-400',    bg: 'bg-amber-500/10',    label: 'Modified' },
  sync_error:     { dot: 'bg-red-400',      text: 'text-red-400',      bg: 'bg-red-500/10',      label: 'Sync Error' },
};

export function StatusDot({ status, title }: { status: StatusType; title?: string }) {
  const style = statusStyles[status] || statusStyles.idle;
  return (
    <span
      className={cn('w-2 h-2 rounded-full flex-shrink-0', style.dot)}
      title={title || style.label}
    />
  );
}

export function StatusBadge({ status, label }: { status: StatusType; label?: string }) {
  const style = statusStyles[status] || statusStyles.idle;
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1.5', style.text, style.bg)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {label || style.label}
    </span>
  );
}
