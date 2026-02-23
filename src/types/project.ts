/**
 * Project and Run Types for MCP4EDA
 */

/**
 * Project represents a design project
 */
export interface Project {
  id: string;
  name: string;
  designName?: string;
  topModule?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Run types
 */
export type RunType = 'synthesis' | 'simulation' | 'openlane' | 'tuning';

/**
 * Run status
 */
export type RunStatus = 'pending' | 'running' | 'success' | 'failed';

/**
 * Run represents an execution of a tool
 */
export interface Run {
  id: string;
  projectId: string;
  runType: RunType;
  status: RunStatus;
  config?: Record<string, any>;
  results?: Record<string, any>;
  startedAt?: Date;
  completedAt?: Date;
  parentRunId?: string;  // For AutoTuner runs, reference to base OpenLane run
}

/**
 * File types
 */
export type FileType = 'input' | 'output' | 'report' | 'gds' | 'vcd' | 'config' | 'constraint';

/**
 * TrackedFile represents a file in the project
 */
export interface TrackedFile {
  id: number;
  projectId: string;
  runId?: string;
  fileType: FileType;
  filePath: string;
  createdAt: Date;
}

/**
 * PPA Metrics from OpenLane runs
 */
export interface PPAMetrics {
  id: number;
  runId: string;
  areaUm2?: number;
  powerMw?: number;
  frequencyMhz?: number;
  wnsNs?: number;  // Worst Negative Slack
  tnsNs?: number;  // Total Negative Slack
  cellCount?: number;
}

/**
 * Project with associated data
 */
export interface ProjectWithDetails extends Project {
  runs: Run[];
  files: TrackedFile[];
  latestPPA?: PPAMetrics;
}

/**
 * Create project input
 */
export interface CreateProjectInput {
  name: string;
  designName?: string;
  topModule?: string;
}

/**
 * Create run input
 */
export interface CreateRunInput {
  projectId: string;
  runType: RunType;
  config?: Record<string, any>;
  parentRunId?: string;  // For AutoTuner runs, reference to base OpenLane run
}
