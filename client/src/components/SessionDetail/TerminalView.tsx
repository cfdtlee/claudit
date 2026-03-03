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

  const pendingTaskPrompt = useUIStore(s => s.pendingTaskPrompt);
  const setPendingTaskPrompt = useUIStore(s => s.setPendingTaskPrompt);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
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
          return; // handle first image only
        }
      }
    };
    containerRef.current.addEventListener('paste', pasteHandler);

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send resume or new message with terminal dimensions
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

      // Check for control message prefix
      if (data.startsWith(CTRL_PREFIX)) {
        const ctrl = JSON.parse(data.slice(1));
        switch (ctrl.type) {
          case 'ready':
            setStatus('connected');
            // Show warning if another claude process is using this session
            if (ctrl.warning) {
              term.writeln('\x1b[33m⚠ ' + ctrl.warning + '\x1b[0m');
            }
            setTimeout(() => {
              fitAddonRef.current?.fit();
              termRef.current?.scrollToBottom();
            }, 50);
            // Pre-fill pending task prompt (no Enter — user reviews and submits)
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
            break;
          case 'error':
            setStatus('error');
            term.writeln('\x1b[31mError: ' + ctrl.message + '\x1b[0m');
            break;
        }
        return;
      }

      // Raw PTY data
      term.write(data);
    };

    ws.onerror = () => {
      setStatus('error');
      term.writeln('\x1b[31mWebSocket connection error\x1b[0m');
    };

    ws.onclose = () => {
      if (termRef.current) {
        setStatus('exited');
      }
    };

    // Forward user input to PTY
    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Resize handling with debounce
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

    // Cleanup
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
    };
  }, [sessionId, projectPath, isNew]);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 border-b border-gray-800 text-xs shrink-0">
        <span className={
          status === 'connected' ? 'text-green-400' :
          status === 'connecting' ? 'text-yellow-400' :
          status === 'error' ? 'text-red-400' :
          'text-gray-500'
        }>
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
            status === 'connected' ? 'bg-green-400' :
            status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
            status === 'error' ? 'bg-red-400' :
            'bg-gray-500'
          }`} />
          {status === 'connected' ? 'Terminal connected' :
           status === 'connecting' ? 'Connecting...' :
           status === 'error' ? 'Connection error' :
           'Process exited'}
        </span>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ padding: '4px 0 0 4px' }}
      />
    </div>
  );
}
