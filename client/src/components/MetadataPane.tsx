import { useState } from 'react';
import type { NormalizedMessage, WorkflowState } from '@copilot-chat/shared';
import './chat.css';

interface MetadataPaneProps {
  messages: NormalizedMessage[];
  workflowState?: WorkflowState | null;
}

/**
 * Flattens a nested object into dot-notation key-value pairs.
 * Stops at depth 3 and marks deeper values for JSON display.
 *
 * META-02: Nested objects up to 3 levels deep displayed inline,
 * deeper structures show "View full data" toggle.
 */
function flattenData(
  obj: Record<string, unknown>,
  prefix = '',
  depth = 0
): Array<{ key: string; value: string; needsJsonView: boolean }> {
  const result: Array<{ key: string; value: string; needsJsonView: boolean }> = [];

  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;

    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (depth < 2) {
        // Recurse into nested objects up to 3 levels (depth 0, 1, 2)
        result.push(...flattenData(v as Record<string, unknown>, fullKey, depth + 1));
      } else {
        // Deeper than 3 levels — show as JSON
        result.push({ key: fullKey, value: JSON.stringify(v, null, 2), needsJsonView: true });
      }
    } else {
      result.push({ key: fullKey, value: String(v ?? ''), needsJsonView: false });
    }
  }

  return result;
}

/**
 * MetadataPane — Activity log sidebar with workflow data section.
 *
 * Shows "Workflow Data" section above Activity Log when workflowState has collectedData.
 * Workflow data displayed as semantic HTML (dl/dt/dd) with dot-notation for nested objects.
 *
 * UI-11: Metadata sidebar visible on desktop (>=768px)
 * UI-12: Activity log download button
 * META-01: Workflow Data section with collectedData key-value pairs
 * META-02: Nested data inline, deep structures show JSON viewer toggle
 */
export function MetadataPane({ messages, workflowState }: MetadataPaneProps) {
  const [showFullData, setShowFullData] = useState<Record<string, boolean>>({});
  const cardActions = messages.filter((m) => m.kind === 'adaptiveCard');

  const collectedData = workflowState?.collectedData;
  const hasWorkflowData = collectedData && Object.keys(collectedData).length > 0;

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
      {hasWorkflowData && (
        <div className="workflowDataSection">
          <h2 className="metadataPaneTitle">Workflow Data</h2>
          <dl className="workflowDataList">
            {flattenData(collectedData).map(({ key, value, needsJsonView }) => (
              <div key={key} className="workflowDataEntry">
                <dt className="workflowDataKey">{key}</dt>
                {needsJsonView ? (
                  <dd className="workflowDataValue">
                    <button
                      type="button"
                      className="viewFullDataToggle"
                      onClick={() => setShowFullData((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      {showFullData[key] ? 'Hide' : 'View full data'}
                    </button>
                    {showFullData[key] && (
                      <pre className="workflowDataJson">{value}</pre>
                    )}
                  </dd>
                ) : (
                  <dd className="workflowDataValue">{value}</dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      )}
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
