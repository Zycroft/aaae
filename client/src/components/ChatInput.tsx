import { useState, useRef } from 'react';

const MAX_CHARS = 4000;
const COUNTER_WARNING_THRESHOLD = 400;
const COUNTER_DANGER_THRESHOLD = 200;

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  /** Hints the client about the preferred input mode for this workflow step. SCHEMA-01 */
  suggestedInputType?: 'text' | 'choice' | 'confirmation' | 'none';
  /** Available choices when suggestedInputType is 'choice'. SCHEMA-01 */
  choices?: string[];
}

/**
 * Auto-resizing textarea + Send button with dynamic input modes.
 *
 * Locked decisions (from CONTEXT.md):
 * - Enter sends; Shift+Enter inserts newline
 * - Auto-resizes vertically up to max height, then scrolls within box
 * - Disabled while bot is responding (props.disabled)
 * - 4000 character limit (Claude's discretion)
 *
 * Dynamic modes (INPUT-01 through INPUT-05):
 * - 'choice': Renders clickable pill buttons for each choice above textarea
 * - 'confirmation': Renders Yes/No buttons above textarea
 * - 'none': Disables textarea with status message
 * - 'text'/undefined: Default textarea behavior
 *
 * Free-text textarea always remains as fallback in choice and confirmation modes (INPUT-04).
 *
 * UI-03, INPUT-01, INPUT-02, INPUT-03, INPUT-04, INPUT-05
 */
export function ChatInput({ onSend, disabled, suggestedInputType, choices }: ChatInputProps) {
  const [text, setText] = useState('');
  const [showAllChoices, setShowAllChoices] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remaining = MAX_CHARS - text.length;
  const showCounter = text.length > MAX_CHARS - COUNTER_WARNING_THRESHOLD;
  const isDanger = remaining < COUNTER_DANGER_THRESHOLD;

  const isChoiceMode = suggestedInputType === 'choice' && choices && choices.length > 0;
  const isConfirmationMode = suggestedInputType === 'confirmation';
  const isDisabledMode = suggestedInputType === 'none';

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    setText(el.value);

    // Auto-resize: reset then expand to scrollHeight (capped at CSS max-height)
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function handlePillClick(value: string) {
    onSend(value);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || isDisabledMode || trimmed.length > MAX_CHARS) return;
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

  const placeholder = isChoiceMode
    ? 'Select an option or type a message...'
    : isConfirmationMode
      ? 'Confirm or type a message...'
      : 'Type a message\u2026';

  return (
    <div className="chatInputArea">
      {isChoiceMode && (
        <div className="choicePillRow" role="group" aria-label="Available choices">
          {(showAllChoices ? choices : choices.slice(0, 6)).map((choice) => (
            <button
              key={choice}
              type="button"
              className="choicePill"
              onClick={() => handlePillClick(choice)}
            >
              {choice}
            </button>
          ))}
          {choices.length > 6 && !showAllChoices && (
            <button
              type="button"
              className="showMoreToggle"
              onClick={() => setShowAllChoices(true)}
            >
              Show more
            </button>
          )}
        </div>
      )}
      {isConfirmationMode && (
        <div className="choicePillRow" role="group" aria-label="Confirmation">
          <button
            type="button"
            className="choicePill choicePillPrimary"
            onClick={() => handlePillClick('Yes')}
          >
            Yes
          </button>
          <button
            type="button"
            className="choicePill"
            onClick={() => handlePillClick('No')}
          >
            No
          </button>
        </div>
      )}
      {isDisabledMode && (
        <div className="inputDisabledStatus">Waiting for workflow...</div>
      )}
      <div className="inputRow">
        <textarea
          ref={textareaRef}
          className="chatTextarea"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || isDisabledMode}
          placeholder={placeholder}
          rows={1}
          maxLength={MAX_CHARS + 1} // Allow one over to show counter, submit blocked
          aria-label="Message input"
          aria-multiline="true"
        />
        <button
          className="sendButton"
          type="button"
          onClick={submit}
          disabled={disabled || isDisabledMode || !text.trim()}
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
