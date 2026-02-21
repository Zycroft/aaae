import './chat.css';
import { useChatApi } from '../hooks/useChatApi.js';
import { useTheme } from '../hooks/useTheme.js';
import { TranscriptView } from './TranscriptView.js';
import { ChatInput } from './ChatInput.js';
import { ThemeToggle } from './ThemeToggle.js';
import { MetadataPane } from './MetadataPane.js';

/**
 * Top-level chat UI shell.
 * Wires useChatApi state into the transcript and input components.
 * Manages theme via useTheme hook (UI-13).
 * Layout uses responsive split-pane grid (UI-01) with metadata drawer slot for Phase 4.
 *
 * UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, UI-09, UI-13
 */
export function ChatShell() {
  const { messages, isLoading, error, sendMessage, cardAction } = useChatApi();
  const { theme, toggle } = useTheme();

  return (
    <div className="appLayout">
      {/* Left column: full chat UI */}
      <div className="chatPane">
        <div className="chatShell">
          {error && <div className="globalError">{error}</div>}
          <ThemeToggle theme={theme} onToggle={toggle} />
          <TranscriptView messages={messages} isLoading={isLoading} onCardAction={cardAction} />
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </div>
      {/* Phase 4: metadata drawer — UI-11, UI-12 */}
      <MetadataPane messages={messages} />
    </div>
  );
}
