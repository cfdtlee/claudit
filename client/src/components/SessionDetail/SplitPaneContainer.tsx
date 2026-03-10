import { useCallback, useRef, useEffect } from 'react';
import { PaneNode, SplitPane, usePaneStore } from '../../stores/usePaneStore';
import PaneLeaf from './PaneLeaf';

interface Props {
  node: PaneNode;
  isDragging: boolean;
  onCreateSession?: (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => Promise<true | string>;
}

function countLeaves(node: PaneNode): number {
  if (node.type === 'leaf') return 1;
  return countLeaves(node.first) + countLeaves(node.second);
}

export default function SplitPaneContainer({ node, isDragging, onCreateSession }: Props) {
  const isOnly = node.type === 'leaf' && countLeaves(usePaneStore.getState().root) === 1;

  if (node.type === 'leaf') {
    return (
      <PaneLeaf
        leaf={node}
        isOnly={isOnly}
        isDragging={isDragging}
        onCreateSession={onCreateSession}
      />
    );
  }

  return (
    <SplitView node={node} isDragging={isDragging} onCreateSession={onCreateSession} />
  );
}

function SplitView({ node, isDragging, onCreateSession }: { node: SplitPane; isDragging: boolean; onCreateSession?: Props['onCreateSession'] }) {
  const resizeSplit = usePaneStore(s => s.resizeSplit);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isHorizontal = node.direction === 'horizontal';

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add('select-none');
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = isHorizontal
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
      resizeSplit(node.id, ratio);
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.classList.remove('select-none');
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isHorizontal, node.id, resizeSplit]);

  return (
    <div
      ref={containerRef}
      className="flex flex-1 min-w-0 min-h-0"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      <div style={{ flex: node.ratio }} className="min-w-0 min-h-0 flex">
        <SplitPaneContainer node={node.first} isDragging={isDragging} onCreateSession={onCreateSession} />
      </div>
      <div
        onMouseDown={onMouseDown}
        className={`flex-shrink-0 ${isHorizontal ? 'w-[5px] cursor-col-resize' : 'h-[5px] cursor-row-resize'}`}
      />
      <div style={{ flex: 1 - node.ratio }} className="min-w-0 min-h-0 flex">
        <SplitPaneContainer node={node.second} isDragging={isDragging} onCreateSession={onCreateSession} />
      </div>
    </div>
  );
}
