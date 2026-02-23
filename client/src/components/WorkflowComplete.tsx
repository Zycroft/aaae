import type { WorkflowState } from '@copilot-chat/shared';

interface WorkflowCompleteProps {
  workflowState: WorkflowState;
  onReset: () => void;
}

/**
 * Formats a collectedData key into a human-readable label.
 * - Replaces underscores with spaces
 * - Capitalizes the first letter
 * e.g., "first_name" -> "First name", "email_address" -> "Email address"
 */
function formatLabel(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * WorkflowComplete — Completion summary view.
 *
 * Renders when workflowState.status === 'completed'.
 * Shows collected data summary, reset button, and download button.
 *
 * COMPL-01, COMPL-02, COMPL-03
 */
export function WorkflowComplete({ workflowState, onReset }: WorkflowCompleteProps) {
  const data = workflowState.collectedData ?? {};
  const entries = Object.entries(data);

  function downloadSummary() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      status: workflowState.status,
      step: workflowState.step,
      collectedData: data,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-summary-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workflowComplete">
      <div className="workflowCompleteCard">
        <h2 className="workflowCompleteHeading">Workflow Complete</h2>

        {entries.length > 0 && (
          <dl className="workflowCompleteData">
            {entries.map(([key, value]) => (
              <div key={key} className="workflowCompleteDataRow">
                <dt className="workflowCompleteKey">{formatLabel(key)}</dt>
                <dd className="workflowCompleteValue">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="workflowCompleteActions">
          <button
            type="button"
            className="workflowCompleteReset"
            onClick={onReset}
          >
            Start new conversation
          </button>
          <button
            type="button"
            className="workflowCompleteDownload"
            onClick={downloadSummary}
          >
            Download summary
          </button>
        </div>
      </div>
    </div>
  );
}
