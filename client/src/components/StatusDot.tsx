export type StatusType = 'running' | 'success' | 'error' | 'warning' | 'idle' | 'enabled' | 'disabled' | 'done' | 'synced' | 'local_modified' | 'sync_error';

const statusStyles: Record<StatusType, { dot: string; text: string; bg: string; label: string }> = {
  running:        { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-900/30',  label: 'Running' },
  success:        { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-900/30',  label: 'Success' },
  error:          { dot: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-900/30',    label: 'Error' },
  warning:        { dot: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-900/30', label: 'Warning' },
  done:           { dot: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-900/30', label: 'Done' },
  idle:           { dot: 'bg-gray-500',   text: 'text-gray-400',   bg: 'bg-gray-700',      label: 'Idle' },
  enabled:        { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-900/30',  label: 'ON' },
  disabled:       { dot: 'bg-gray-500',   text: 'text-gray-400',   bg: 'bg-gray-700',      label: 'OFF' },
  synced:         { dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-900/30',  label: 'Synced' },
  local_modified: { dot: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-900/30', label: 'Modified' },
  sync_error:     { dot: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-900/30',    label: 'Sync Error' },
};

export function StatusDot({ status, title }: { status: StatusType; title?: string }) {
  const style = statusStyles[status] || statusStyles.idle;
  return (
    <span
      className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`}
      title={title || style.label}
    />
  );
}

export function StatusBadge({ status, label }: { status: StatusType; label?: string }) {
  const style = statusStyles[status] || statusStyles.idle;
  return (
    <span className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1.5 ${style.text} ${style.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {label || style.label}
    </span>
  );
}
