// Lightweight cross-component event bus for WebSocket events
const bus = new EventTarget();

export function emitTaskUpdate() {
  bus.dispatchEvent(new Event('task:updated'));
}

export function onTaskUpdate(cb: () => void): () => void {
  bus.addEventListener('task:updated', cb);
  return () => bus.removeEventListener('task:updated', cb);
}
