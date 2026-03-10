import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | null;

interface Props {
  paneId: string;
  isDragOver: boolean;
  onZoneChange: (zone: DropZone) => void;
}

function computeZone(clientX: number, clientY: number, rect: DOMRect): DropZone {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  // Outside bounds
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

  const distLeft = x;
  const distRight = 1 - x;
  const distTop = y;
  const distBottom = 1 - y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);

  if (min === distLeft) return 'left';
  if (min === distRight) return 'right';
  if (min === distTop) return 'top';
  return 'bottom';
}

export default function DropOverlay({ paneId, isDragOver, onZoneChange }: Props) {
  const [zone, setZone] = useState<DropZone>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<DropZone>(null);

  // Track pointer globally during drag — works even when DragOverlay captures events
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newZone = computeZone(e.clientX, e.clientY, rect);
      const inside = newZone !== null;

      if (inside !== isPointerInside) setIsPointerInside(inside);

      if (newZone !== zoneRef.current) {
        zoneRef.current = newZone;
        setZone(newZone);
        onZoneChange(newZone);
      }
    };

    window.addEventListener('pointermove', handler);
    return () => window.removeEventListener('pointermove', handler);
  }, [onZoneChange, isPointerInside]);

  const showPreview = (isDragOver || isPointerInside) && zone;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-50 pointer-events-none"
    >
      {showPreview && (
        <div
          className={cn(
            'absolute transition-all duration-100 bg-primary/12 border-2 border-dashed border-primary/35 rounded-md',
            zone === 'left' && 'top-1 left-1 bottom-1 w-[calc(50%-4px)]',
            zone === 'right' && 'top-1 right-1 bottom-1 w-[calc(50%-4px)]',
            zone === 'top' && 'top-1 left-1 right-1 h-[calc(50%-4px)]',
            zone === 'bottom' && 'bottom-1 left-1 right-1 h-[calc(50%-4px)]',
          )}
        />
      )}
    </div>
  );
}
