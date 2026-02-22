import { readFileSync } from 'fs';

/**
 * WorkflowStep — a single step in a workflow definition.
 */
export interface WorkflowStep {
  /** Unique step identifier (e.g., 'gather_info', 'confirm', 'complete') */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Optional description of what this step does */
  description?: string;
}

/**
 * WorkflowDefinition — an ordered list of steps defining a workflow.
 *
 * Step definitions live in a config file, NOT embedded in WorkflowState.
 * The orchestrator tracks position against this definition for progress reporting.
 */
export interface WorkflowDefinition {
  /** Definition identifier */
  id: string;
  /** Human-readable workflow name */
  name: string;
  /** Ordered array of steps — position determines progress percentage */
  steps: WorkflowStep[];
}

/**
 * WorkflowProgress — progress indicator computed from step position in definition.
 *
 * ORCH-04
 */
export interface WorkflowProgress {
  /** Current step identifier from workflow definition */
  currentStep: string;
  /** 0-based index in definition steps */
  stepIndex: number;
  /** Total steps in workflow definition */
  totalSteps: number;
  /** stepIndex / totalSteps * 100, rounded to integer */
  percentComplete: number;
}

/**
 * Default workflow definition — generic steps that work for any Copilot agent.
 *
 * Covers the common pattern: initial state, information gathering,
 * research/analysis, confirmation, and completion.
 */
export const DEFAULT_WORKFLOW_DEFINITION: WorkflowDefinition = {
  id: 'default',
  name: 'Default Workflow',
  steps: [
    { id: 'initial', name: 'Initial', description: 'Starting state -- awaiting first user input' },
    { id: 'gather_info', name: 'Gather Information', description: 'Collecting user requirements and preferences' },
    { id: 'research', name: 'Research', description: 'Agent researching options based on collected data' },
    { id: 'confirm', name: 'Confirm', description: 'Presenting recommendation for user confirmation' },
    { id: 'complete', name: 'Complete', description: 'Workflow completed -- final response delivered' },
  ],
};

/**
 * Load a workflow definition from a JSON file, or return the default.
 *
 * @param definitionPath — Optional path to a JSON definition file
 * @returns WorkflowDefinition
 */
export function loadWorkflowDefinition(definitionPath?: string): WorkflowDefinition {
  if (!definitionPath) {
    return DEFAULT_WORKFLOW_DEFINITION;
  }

  const raw = readFileSync(definitionPath, 'utf-8');
  const parsed = JSON.parse(raw) as WorkflowDefinition;

  // Basic shape validation
  if (!parsed.id || !parsed.name || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error(
      `Invalid workflow definition at ${definitionPath}: must have id, name, and non-empty steps array`
    );
  }

  return parsed;
}

/**
 * Compute progress from a step's position in the workflow definition.
 *
 * @param stepId — Current step identifier
 * @param definition — Workflow definition to compute against
 * @returns WorkflowProgress with percentage based on step index
 */
export function getStepProgress(
  stepId: string,
  definition: WorkflowDefinition
): WorkflowProgress {
  const stepIndex = definition.steps.findIndex((s) => s.id === stepId);
  const resolvedIndex = stepIndex >= 0 ? stepIndex : 0;

  return {
    currentStep: stepId,
    stepIndex: resolvedIndex,
    totalSteps: definition.steps.length,
    percentComplete: Math.round((resolvedIndex / definition.steps.length) * 100),
  };
}
