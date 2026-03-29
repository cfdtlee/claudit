import { useState, useCallback, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { X, GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePaneStore, LeafPane } from '../../stores/usePaneStore';
import SessionDetail from './SessionDetail';
import EmptyState from './EmptyState';
import DropOverlay, { DropZone } from './DropOverlay';

// Global registry so onDragEnd can read the current drop zone
const dropZoneRegistry = new Map<string, DropZone>();
export function getDropZone(paneId: string): DropZone {
  return dropZoneRegistry.get(paneId) ?? null;
}

interface Props {
  leaf: LeafPane;
  isOnly: boolean;
  isDragging: boolean;
  onCreateSession?: (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => Promise<true | string>;
}

export default function PaneLeaf({ leaf, isOnly, isDragging, onCreateSession }: Props) {
  const activePaneId = usePaneStore(s => s.activePaneId);
  const setActivePane = usePaneStore(s => s.setActivePane);
  const closePane = usePaneStore(s => s.closePane);
  const isActive = activePaneId === leaf.id;

  const [hoverCorner, setHoverCorner] = useState(false);

  // Droppable — accept drops from list items and other panes
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `pane-drop-${leaf.id}`,
    data: { paneId: leaf.id },
  });

  // Draggable — drag this pane by its header
  const { attributes, listeners, setNodeRef: setDragRef, isDragging: isPaneDragging } = useDraggable({
    id: `pane-drag-${leaf.id}`,
    data: {
      type: 'pane',
      paneId: leaf.id,
      session: leaf.session,
    },
    disabled: isOnly || !leaf.session,
  });

  // Clean up registry on unmount
  useEffect(() => {
    return () => { dropZoneRegistry.delete(leaf.id); };
  }, [leaf.id]);

  const handlePointerDown = useCallback(() => {
    if (!isActive) setActivePane(leaf.id);
  }, [isActive, leaf.id, setActivePane]);

  const handleZoneChange = useCallback((zone: DropZone) => {
    dropZoneRegistry.set(leaf.id, zone);
  }, [leaf.id]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isOnly || isDragging) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHoverCorner(x < 40 && y < 40);
  }, [isOnly, isDragging]);

  const handleMouseLeave = useCallback(() => {
    setHoverCorner(false);
  }, []);

  const anyDragging = isDragging || isPaneDragging;

  return (
    <div
      ref={setDropRef}
      className={cn(
        'relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden transition-all duration-200',
        isPaneDragging && 'opacity-40',
      )}
      style={!isOnly ? {
        boxShadow: isActive
          ? 'inset 0 0 0 1px hsl(var(--primary) / 0.4)'
          : 'inset 0 0 0 1px hsl(var(--border) / 0.3)',
        borderRadius: '6px',
      } : undefined}
      onPointerDown={handlePointerDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Close button — vertically centered with header title (h-11 = 44px) */}
      {!isOnly && hoverCorner && !anyDragging && (
        <button
          onClick={(e) => { e.stopPropagation(); closePane(leaf.id); }}
          className="absolute z-40 w-5 h-5 rounded-md bg-secondary/90 hover:bg-destructive/80 text-muted-foreground hover:text-white flex items-center justify-center transition-all shadow-sm border border-border/50"
          style={{ top: 12, left: 6 }}
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Drag handle for pane — overlay on header right side */}
      {!isOnly && leaf.session && !anyDragging && (
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          className="absolute top-0 right-0 z-40 h-11 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/0 hover:text-muted-foreground transition-colors"
          title="Drag to rearrange"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Content */}
      {leaf.session ? (
        <SessionDetail
          projectHash={leaf.session.projectHash}
          sessionId={leaf.session.sessionId}
          projectPath={leaf.session.projectPath}
          isNew={leaf.session.isNew}
          slug={leaf.session.slug}
          slugSessionIds={leaf.session.slugSessionIds}
          isMultiPane={!isOnly}
          permissionMode={leaf.session.permissionMode}
        />
      ) : (
        <EmptyState onCreateSession={onCreateSession} />
      )}

      {/* Drop overlay during drag — show on non-dragging panes */}
      {isDragging && !isPaneDragging && (
        <DropOverlay
          paneId={leaf.id}
          isDragOver={isOver}
          onZoneChange={handleZoneChange}
        />
      )}
    </div>
  );
}
