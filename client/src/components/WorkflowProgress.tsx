import type { WorkflowState } from '@copilot-chat/shared';

interface WorkflowProgressProps {
  workflowState: WorkflowState | null;
}

/**
 * Progress indicator bar for active workflows.
 *
 * - Shows phase label + determinate bar (0-100%) when progress is a number
 * - Shows phase label + indeterminate pulsing bar when progress is null
 * - Returns null (no DOM) when workflowState is null or status is not 'active'
 *
 * PROG-01, PROG-02, PROG-03
 */
export function WorkflowProgress({ workflowState }: WorkflowProgressProps) {
  // Only render when a workflow is actively running
  if (!workflowState || workflowState.status !== 'active') return null;

  const label = workflowState.currentPhase ?? 'Processing\u2026';
  const isDeterminate = workflowState.progress != null;
  const widthPct = isDeterminate ? `${Math.round((workflowState.progress ?? 0) * 100)}%` : undefined;

  return (
    <div className="workflowProgress" role="status" aria-label={`Workflow: ${label}`}>
      <span className="workflowProgressLabel">{label}</span>
      <div className="workflowProgressTrack" aria-hidden="true">
        <div
          className={`workflowProgressBar${isDeterminate ? '' : ' indeterminate'}`}
          style={isDeterminate ? { width: widthPct } : undefined}
        />
      </div>
    </div>
  );
}
