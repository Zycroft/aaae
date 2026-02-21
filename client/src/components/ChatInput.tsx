import { useState, useRef } from 'react';

const MAX_CHARS = 4000;
const COUNTER_WARNING_THRESHOLD = 400;
const COUNTER_DANGER_THRESHOLD = 200;

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

/**
 * Auto-resizing textarea + Send button.
 *
 * Locked decisions (from CONTEXT.md):
 * - Enter sends; Shift+Enter inserts newline
 * - Auto-resizes vertically up to max height, then scrolls within box
 * - Disabled while bot is responding (props.disabled)
 * - 4000 character limit (Claude's discretion)
 *
 * UI-03
 */
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remaining = MAX_CHARS - text.length;
  const showCounter = text.length > MAX_CHARS - COUNTER_WARNING_THRESHOLD;
  const isDanger = remaining < COUNTER_DANGER_THRESHOLD;

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    setText(el.value);

    // Auto-resize: reset then expand to scrollHeight (capped at CSS max-height)
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || trimmed.length > MAX_CHARS) return;
    onSend(trimmed);
    setText('');

    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="chatInputArea">
      <div className="inputRow">
        <textarea
          ref={textareaRef}
          className="chatTextarea"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type a message…"
          rows={1}
          maxLength={MAX_CHARS + 1} // Allow one over to show counter, submit blocked
          aria-label="Message input"
          aria-multiline="true"
        />
        <button
          className="sendButton"
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
      {showCounter && (
        <div className={`charCounter${isDanger ? ' warning' : ''}`}>
          {remaining} character{remaining !== 1 ? 's' : ''} remaining
        </div>
      )}
    </div>
  );
}
