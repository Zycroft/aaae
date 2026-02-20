import './chat.css';
import { useChatApi } from '../hooks/useChatApi.js';
import { TranscriptView } from './TranscriptView.js';
import { ChatInput } from './ChatInput.js';

/**
 * Top-level chat UI shell.
 * Wires useChatApi state into the transcript and input components.
 *
 * UI-02, UI-03, UI-04, UI-05, UI-09
 */
export function ChatShell() {
  const { messages, isLoading, error, sendMessage } = useChatApi();

  return (
    <div className="chatShell">
      {error && <div className="globalError">{error}</div>}
      <TranscriptView messages={messages} isLoading={isLoading} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
