import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  const composingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  return (
    <div className="px-3 py-2.5">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          data-search-input
          placeholder="Search sessions..."
          value={localValue}
          onChange={e => {
            setLocalValue(e.target.value);
            if (!composingRef.current) {
              onChange(e.target.value);
            }
          }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={e => {
            composingRef.current = false;
            const val = (e.target as HTMLInputElement).value;
            setLocalValue(val);
            onChange(val);
          }}
          className="w-full pl-8 pr-7 py-2 rounded-lg bg-secondary/50 text-foreground text-sm
                     placeholder-muted-foreground border border-border/50 focus:border-primary/50
                     focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
        />
        {localValue && (
          <button
            onClick={() => { setLocalValue(''); onChange(''); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
