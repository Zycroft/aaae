import { useRef, useEffect } from 'react';
import type { TranscriptMessage } from '../hooks/useChatApi.js';
import { MessageBubble } from './MessageBubble.js';
import { SkeletonBubble } from './SkeletonBubble.js';

interface TranscriptViewProps {
  messages: TranscriptMessage[];
  isLoading: boolean;
  onCardAction: (
    cardId: string,
    userSummary: string,
    submitData: Record<string, unknown>
  ) => void;
}

/**
 * Scrolling transcript of message bubbles.
 *
 * Smart scroll: auto-scrolls to bottom only when the user is already
 * within 100px of the bottom (Claude's discretion). If the user has
 * scrolled up to review history, auto-scroll does not interrupt.
 *
 * Passes onCardAction down to each MessageBubble for Adaptive Card submit handling.
 *
 * UI-02, UI-03, UI-04, UI-07
 */
export function TranscriptView({ messages, isLoading, onCardAction }: TranscriptViewProps) {
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
    <div
      className="transcriptView"
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
      aria-relevant="additions"
    >
      {messages.map((message, index) => {
        // Phase divider: show when consecutive messages have different workflowPhase (TRANS-01)
        const prevPhase = index > 0 ? messages[index - 1].workflowPhase : undefined;
        const showDivider =
          message.workflowPhase !== undefined &&
          prevPhase !== undefined &&
          prevPhase !== message.workflowPhase;

        return (
          <div key={message.id}>
            {showDivider && (
              <div className="phaseDivider" role="separator" aria-label={`Phase: ${message.workflowPhase}`}>
                <span className="phaseDividerLabel">{message.workflowPhase}</span>
              </div>
            )}
            <MessageBubble message={message} onCardAction={onCardAction} />
          </div>
        );
      })}
      {isLoading && <SkeletonBubble />}
    </div>
  );
}
