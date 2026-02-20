import type { TranscriptMessage } from '../hooks/useChatApi.js';

interface MessageBubbleProps {
  message: TranscriptMessage;
}

/**
 * Renders a single message bubble with avatar and content.
 *
 * - User bubbles: right-aligned (row-reverse), blue background
 * - Assistant bubbles: left-aligned, grey background
 * - Adaptive Cards: placeholder for Phase 3
 * - Status 'sending': subtle opacity
 * - Status 'error': inline error below bubble (UI-05)
 *
 * UI-02
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSending = message.status === 'sending';
  const isError = message.status === 'error';

  const avatarLabel = isUser ? 'You' : 'Bot';
  const avatarClass = isUser ? 'avatar userAvatar' : 'avatar botAvatar';
  const bubbleClass = `messageBubble ${message.role}`;
  const contentClass = `bubbleContent${isSending ? ' sending' : ''}`;

  return (
    <div>
      <div className={bubbleClass}>
        <div className={avatarClass} aria-hidden="true">
          {avatarLabel}
        </div>
        <div className={contentClass}>
          {message.kind === 'text' && (
            <span>{message.text}</span>
          )}
          {message.kind === 'adaptiveCard' && (
            <span className="cardPlaceholder">[Interactive card — Phase 3]</span>
          )}
        </div>
      </div>
      {isError && message.errorMessage && (
        <div className={`inlineError${isUser ? '' : ''}`}>
          {message.errorMessage}
        </div>
      )}
    </div>
  );
}
