import { useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  const composingRef = useRef(false);

  return (
    <div className="p-3 border-b border-gray-800">
      <div className="relative flex items-center gap-2">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          data-search-input
          placeholder="Search sessions..."
          value={value}
          onChange={e => {
            if (!composingRef.current) {
              onChange(e.target.value);
            }
          }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={e => {
            composingRef.current = false;
            onChange((e.target as HTMLInputElement).value);
          }}
          className="w-full pl-8 pr-7 py-2 rounded-md bg-gray-800 text-gray-200 text-sm
                     placeholder-gray-500 border border-gray-700 focus:border-blue-500
                     focus:outline-none transition-colors"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
