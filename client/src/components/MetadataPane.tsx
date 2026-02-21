import type { NormalizedMessage } from '@copilot-chat/shared';
import './chat.css';

interface MetadataPaneProps {
  messages: NormalizedMessage[];
}

/**
 * MetadataPane — Activity log sidebar for the chat shell.
 *
 * Filters messages to adaptiveCard kind and renders a numbered timeline.
 * Includes a Download button that exports the full conversation as a dated JSON file.
 *
 * UI-11: Metadata sidebar visible on desktop (≥768px)
 * UI-12: Activity log download button
 */
export function MetadataPane({ messages }: MetadataPaneProps) {
  const cardActions = messages.filter((m) => m.kind === 'adaptiveCard');

  function downloadActivityLog() {
    const data = {
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `activity-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="metadataPane" aria-label="Activity log">
      <div className="metadataPaneHeader">
        <h2 className="metadataPaneTitle">Activity Log</h2>
        <button
          className="downloadButton"
          onClick={downloadActivityLog}
          aria-label="Download activity log as JSON"
        >
          Download
        </button>
      </div>
      {cardActions.length === 0 ? (
        <p className="metadataPanePlaceholder">No card actions yet</p>
      ) : (
        <ol className="activityTimeline">
          {cardActions.map((action, idx) => (
            <li key={action.id} className="timelineItem">
              <span className="timelineIndex" aria-label={`Action ${idx + 1}`}>
                #{idx + 1}
              </span>
              <span className="cardId">{action.cardId ?? 'unknown'}</span>
              {action.text && <p className="actionSummary">{action.text}</p>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
