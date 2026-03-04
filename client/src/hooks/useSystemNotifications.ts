import { useEffect } from 'react';
import { toast } from 'sonner';

export function useSystemNotifications() {
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'notification') return;

        const { level = 'info', message, title, duration } = data;

        const opts = {
          description: title ? message : undefined,
          duration: duration ?? 10000,
        };

        const display = title ?? message;

        switch (level) {
          case 'success':
            toast.success(display, opts);
            break;
          case 'error':
            toast.error(display, { ...opts, duration: duration ?? 15000 });
            break;
          case 'warning':
            toast.warning(display, opts);
            break;
          default:
            toast.info(display, opts);
        }
      } catch { /* ignore non-JSON */ }
    };

    return () => ws.close();
  }, []);
}
