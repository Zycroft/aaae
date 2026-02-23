import type { TranscriptMessage } from '../hooks/useChatApi.js';
import { AdaptiveCardMessage } from './AdaptiveCardMessage.js';

interface MessageBubbleProps {
  message: TranscriptMessage;
  onCardAction: (
    cardId: string,
    userSummary: string,
    submitData: Record<string, unknown>
  ) => void;
}

/**
 * Renders a single message bubble with avatar and content.
 *
 * - User bubbles: right-aligned (row-reverse), blue background
 * - Assistant bubbles: left-aligned, grey background
 * - Adaptive Cards: rendered via AdaptiveCardMessage (UI-06, UI-07, UI-08)
 * - Card submit chip: compact pill for subKind === 'cardSubmit' (UI-10)
 * - Status 'sending': subtle opacity
 * - Status 'error': inline error below bubble (UI-05)
 *
 * UI-02, UI-06, UI-07, UI-08, UI-10, TRANS-02
 */
export function MessageBubble({ message, onCardAction }: MessageBubbleProps) {
  // Orchestrator status messages: centered muted text, no bubble or avatar (TRANS-02)
  if (message.subKind === 'orchestratorStatus') {
    return (
      <div className="orchestratorStatus" role="status">
        <span>{message.text}</span>
      </div>
    );
  }

  const isUser = message.role === 'user';
  const isSending = message.status === 'sending';
  const isError = message.status === 'error';
  const isCardSubmit = message.subKind === 'cardSubmit';

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
          {message.kind === 'text' && !isCardSubmit && (
            <span>{message.text}</span>
          )}
          {message.kind === 'text' && isCardSubmit && (
            <span className="cardSubmitChip">{message.text}</span>
          )}
          {message.kind === 'adaptiveCard' && (
            <AdaptiveCardMessage message={message} onCardAction={onCardAction} />
          )}
        </div>
      </div>
      {isError && message.errorMessage && (
        <div className="inlineError">
          {message.errorMessage}
        </div>
      )}
    </div>
  );
}
