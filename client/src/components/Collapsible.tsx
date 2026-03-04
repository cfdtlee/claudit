import { useState, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  storageKey?: string;
  children: ReactNode;
}

function loadState(key?: string, defaultOpen?: boolean): boolean {
  if (!key) return defaultOpen ?? true;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved === 'true';
  } catch {}
  return defaultOpen ?? true;
}

export default function Collapsible({ title, count, defaultOpen, storageKey, children }: Props) {
  const [open, setOpen] = useState(() => loadState(storageKey, defaultOpen));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(next)); } catch {}
    }
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <ChevronRight className={cn(
          'w-3.5 h-3.5 transition-transform duration-150',
          open && 'rotate-90'
        )} />
        <span>{title}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground/50">({count})</span>
        )}
      </button>
      {open && <div className="animate-fade-in">{children}</div>}
    </div>
  );
}
