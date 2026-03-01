import { useState, useEffect, useRef, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MergedSessionDetail, ParsedMessage } from '../../types';
import { fetchMergedSessionDetail } from '../../api/sessions';

const INITIAL_COUNT = 100;
const LOAD_MORE_COUNT = 100;

interface Props {
  projectHash: string;
  slug: string;
}

const MessageBubble = memo(function MessageBubble({ message }: { message: ParsedMessage }) {
  const isUser = message.role === 'user';
  const textContent = message.content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n');

  if (!textContent.trim()) return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-claude/20 text-gray-200'
            : 'bg-gray-800 text-gray-300'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{textContent}</div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: '0.8rem' }}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    );
                  }
                  return (
                    <code className="bg-gray-700/50 px-1 py-0.5 rounded text-xs" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {textContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});

function SessionBoundary({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 border-t border-gray-700/50" />
      <span className="text-xs text-gray-500 whitespace-nowrap">
        continued in session {index + 1}
      </span>
      <div className="flex-1 border-t border-gray-700/50" />
    </div>
  );
}

export default function ConversationView({ projectHash, slug }: Props) {
  const [data, setData] = useState<MergedSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const prevStartIndex = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVisibleCount(INITIAL_COUNT);
    initialScrollDone.current = false;

    fetchMergedSessionDetail(projectHash, slug)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [projectHash, slug]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (data && !initialScrollDone.current) {
      initialScrollDone.current = true;
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView();
      });
    }
  }, [data]);

  // Preserve scroll position when loading more messages at the top
  useEffect(() => {
    if (!data || !containerRef.current) return;
    const startIndex = Math.max(0, data.messages.length - visibleCount);
    if (startIndex < prevStartIndex.current && initialScrollDone.current) {
      // More messages were prepended — restore scroll position
      const el = containerRef.current;
      const prevScrollHeight = el.scrollHeight;
      requestAnimationFrame(() => {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop += newScrollHeight - prevScrollHeight;
      });
    }
    prevStartIndex.current = startIndex;
  }, [visibleCount, data]);

  const loadMore = useCallback(() => {
    if (!data) return;
    setVisibleCount(prev => Math.min(prev + LOAD_MORE_COUNT, data.messages.length));
  }, [data]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || !data) return;
    const { scrollTop } = containerRef.current;
    const startIndex = Math.max(0, data.messages.length - visibleCount);
    if (scrollTop < 150 && startIndex > 0) {
      loadMore();
    }
  }, [data, visibleCount, loadMore]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Loading conversation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!data || data.messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        No messages in this session.
      </div>
    );
  }

  const startIndex = Math.max(0, data.messages.length - visibleCount);
  const visibleMessages = data.messages.slice(startIndex);
  const boundarySet = new Set(data.sessionBoundaries);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      {startIndex > 0 && (
        <div className="flex items-center justify-center gap-3 text-xs text-gray-500 mb-4">
          <button
            className="hover:text-gray-300 transition-colors"
            onClick={loadMore}
          >
            Load {Math.min(LOAD_MORE_COUNT, startIndex)} more...
          </button>
          <span className="text-gray-600">|</span>
          <button
            className="hover:text-gray-300 transition-colors"
            onClick={() => setVisibleCount(data.messages.length)}
          >
            Load all ({startIndex} remaining)
          </button>
        </div>
      )}
      {visibleMessages.map((msg, i) => {
        const globalIndex = startIndex + i;
        return (
          <div key={msg.uuid}>
            {boundarySet.has(globalIndex) && globalIndex > 0 && (
              <SessionBoundary index={data.sessionBoundaries.indexOf(globalIndex)} />
            )}
            <MessageBubble message={msg} />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
