import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useUIStore } from '../../stores/useUIStore';
import '@xterm/xterm/css/xterm.css';

const CTRL_PREFIX = '\x00';

interface Props {
  sessionId: string;
  projectPath: string;
  isNew?: boolean;
}

export default function TerminalView({ sessionId, projectPath, isNew }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'exited' | 'error'>('connecting');
  const [showStatusBar, setShowStatusBar] = useState(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [termReady, setTermReady] = useState(false);

  const pendingTaskPrompt = useUIStore(s => s.pendingTaskPrompt);
  const setPendingTaskPrompt = useUIStore(s => s.setPendingTaskPrompt);

  useEffect(() => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    if (status === 'connecting') {
      setShowStatusBar(true);
    } else if (status === 'error' || status === 'exited') {
      statusTimerRef.current = setTimeout(() => setShowStatusBar(true), 200);
    } else {
      setShowStatusBar(false);
    }
    return () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current); };
  }, [status]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#161514',
        foreground: '#e5e5e5',
        cursor: '#d97756',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#d97756/30',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle image paste — upload to server and write file path to PTY
    const pasteHandler = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            try {
              const resp = await fetch('/api/filesystem/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: base64, mimeType: item.type }),
              });
              const result = await resp.json();
              if (result.path && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data: result.path }));
              }
            } catch (err) {
              console.error('Image paste upload failed:', err);
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    };
    containerRef.current.addEventListener('paste', pasteHandler);

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions();
      ws.send(JSON.stringify({
        type: isNew ? 'new' : 'resume',
        sessionId,
        projectPath,
        cols: dims?.cols || 80,
        rows: dims?.rows || 24,
      }));
    };

    ws.onmessage = (event) => {
      const data = event.data as string;

      if (data.startsWith(CTRL_PREFIX)) {
        const ctrl = JSON.parse(data.slice(1));
        switch (ctrl.type) {
          case 'ready':
            setStatus('connected');
            if (ctrl.warning) {
              term.writeln('\x1b[33m⚠ ' + ctrl.warning + '\x1b[0m');
            }
            setTimeout(() => {
              fitAddonRef.current?.fit();
              termRef.current?.scrollToBottom();
              setTermReady(true);
            }, 50);
            {
              const pending = useUIStore.getState().pendingTaskPrompt;
              if (pending && pending.sessionId === sessionId) {
                setTimeout(() => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'input', data: pending.prompt }));
                  }
                  useUIStore.getState().setPendingTaskPrompt(null);
                }, 1500);
              }
            }
            break;
          case 'scrollback-end':
            fitAddonRef.current?.fit();
            termRef.current?.scrollToBottom();
            break;
          case 'exit':
            setStatus('exited');
            term.writeln('');
            term.writeln('\x1b[90m--- Process exited (code: ' + ctrl.exitCode + ') ---\x1b[0m');
            setTermReady(true);
            break;
          case 'error':
            setStatus('error');
            term.writeln('\x1b[31mError: ' + ctrl.message + '\x1b[0m');
            setTermReady(true);
            break;
        }
        return;
      }

      term.write(data);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus('error');
      setTermReady(true);
      term.writeln('\x1b[31mWebSocket connection error\x1b[0m');
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setStatus('exited');
    };

    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!fitAddonRef.current || !termRef.current) return;
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols: dims.cols,
            rows: dims.rows,
          }));
        }
      }, 100);
    });
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
      inputDisposable.dispose();
      containerRef.current?.removeEventListener('paste', pasteHandler);
      ws.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      setStatus('connecting');
      setTermReady(false);
    };
  }, [sessionId, projectPath, isNew]);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar — only shown for error/exited states */}
      {showStatusBar && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card/30 border-b border-border/30 text-xs shrink-0">
          <span className={
            status === 'connecting' ? 'text-amber-400' :
            status === 'error' ? 'text-destructive' :
            'text-muted-foreground'
          }>
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
              status === 'connecting' ? 'bg-amber-400 animate-pulse' :
              status === 'error' ? 'bg-destructive' :
              'bg-muted-foreground'
            }`} />
            {status === 'connecting' ? 'Connecting...' :
             status === 'error' ? 'Connection error' :
             'Process exited'}
          </span>
        </div>
      )}

      {/* Terminal container — padding on wrapper so FitAddon measures correct dimensions */}
      <div className="flex-1 min-h-0" style={{ padding: '8px 10px' }}>
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ visibility: termReady ? 'visible' : 'hidden' }}
        />
      </div>
    </div>
  );
}
