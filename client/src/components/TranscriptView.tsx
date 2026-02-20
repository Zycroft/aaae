import { useRef, useEffect } from 'react';
import type { TranscriptMessage } from '../hooks/useChatApi.js';
import { MessageBubble } from './MessageBubble.js';
import { SkeletonBubble } from './SkeletonBubble.js';

interface TranscriptViewProps {
  messages: TranscriptMessage[];
  isLoading: boolean;
}

/**
 * Scrolling transcript of message bubbles.
 *
 * Smart scroll: auto-scrolls to bottom only when the user is already
 * within 100px of the bottom (Claude's discretion). If the user has
 * scrolled up to review history, auto-scroll does not interrupt.
 *
 * UI-02, UI-03, UI-04
 */
export function TranscriptView({ messages, isLoading }: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Smart scroll: scroll to bottom only if already near the bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, clientHeight, scrollHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;

    if (isNearBottom) {
      container.scrollTo({ top: scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  return (
    <div className="transcriptView" ref={containerRef}>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {isLoading && <SkeletonBubble />}
    </div>
  );
}
