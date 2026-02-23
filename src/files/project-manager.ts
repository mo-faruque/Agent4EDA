/**
 * ProjectManager - High-level project operations combining database and files
 */

import { database } from "../db/database.js";
import { fileManager } from "./file-manager.js";
import { pathResolver } from "./path-resolver.js";
import {
  Project,
  Run,
  TrackedFile,
  PPAMetrics,
  ProjectWithDetails,
  CreateProjectInput,
  CreateRunInput,
  RunStatus,
  FileType,
} from "../types/project.js";

/**
 * Project creation result
 */
export interface CreateProjectResult {
  project: Project;
  hostPath: string;
  containerPath: string;
}

/**
 * ProjectManager handles high-level project operations
 */
class ProjectManager {
  /**
   * Create a new project with directory structure
   */
  createProject(input: CreateProjectInput): CreateProjectResult {
    // Create project in database
    const project = database.createProject(input);

    // Create project directory
    const hostPath = fileManager.createProjectDir(project.id);
    const containerPath = pathResolver.getProjectContainerPath(project.id);

    return {
      project,
      hostPath,
      containerPath,
    };
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | null {
    return database.getProject(id);
  }

  /**
   * Get project with all details (runs, files, PPA)
   */
  getProjectWithDetails(id: string): ProjectWithDetails | null {
    const project = database.getProject(id);
    if (!project) return null;

    const runs = database.getRunsByProject(id);
    const files = database.getFilesByProject(id);
    const ppaHistory = database.getPPAHistory(id);

    return {
      ...project,
      runs,
      files,
      latestPPA: ppaHistory.length > 0 ? ppaHistory[0] : undefined,
    };
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    return database.getAllProjects();
  }

  /**
   * Get all projects with details
   */
  getAllProjectsWithDetails(): ProjectWithDetails[] {
    const projects = database.getAllProjects();
    return projects.map((project) => {
      const runs = database.getRunsByProject(project.id);
      const files = database.getFilesByProject(project.id);
      const ppaHistory = database.getPPAHistory(project.id);

      return {
        ...project,
        runs,
        files,
        latestPPA: ppaHistory.length > 0 ? ppaHistory[0] : undefined,
      };
    });
  }

  /**
   * Update project
   */
  updateProject(id: string, updates: Partial<CreateProjectInput>): Project | null {
    return database.updateProject(id, updates);
  }

  /**
   * Delete project (database and files)
   */
  deleteProject(id: string): boolean {
    // Delete files first
    fileManager.deleteProjectFiles(id);

    // Delete from database (cascades to runs, files, ppa_metrics)
    return database.deleteProject(id);
  }

  /**
   * Write a design file to a project
   */
  writeDesignFile(
    projectId: string,
    filename: string,
    content: string,
    runId?: string
  ): { hostPath: string; containerPath: string } | null {
    const result = fileManager.writeFile(projectId, filename, content, "input", runId);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      hostPath: result.hostPath!,
      containerPath: result.containerPath!,
    };
  }

  /**
   * Read a design file from a project
   */
  readDesignFile(projectId: string, filename: string): string | null {
    return fileManager.readFile(projectId, filename);
  }

  /**
   * List all files in a project
   */
  listProjectFiles(projectId: string): string[] {
    return fileManager.listFiles(projectId);
  }

  /**
   * Get project paths
   */
  getProjectPaths(projectId: string): { hostPath: string; containerPath: string } {
    return {
      hostPath: pathResolver.getProjectHostPath(projectId),
      containerPath: pathResolver.getProjectContainerPath(projectId),
    };
  }

  // ==================== Run Operations ====================

  /**
   * Create a new run
   */
  createRun(input: CreateRunInput): Run {
    return database.createRun(input);
  }

  /**
   * Start a run
   */
  startRun(runId: string): Run | null {
    return database.updateRunStatus(runId, "running");
  }

  /**
   * Complete a run successfully
   */
  completeRun(runId: string, results?: Record<string, any>): Run | null {
    return database.updateRunStatus(runId, "success", results);
  }

  /**
   * Fail a run
   */
  failRun(runId: string, error?: string): Run | null {
    return database.updateRunStatus(runId, "failed", { error });
  }

  /**
   * Get run by ID
   */
  getRun(id: string): Run | null {
    return database.getRun(id);
  }

  /**
   * Get runs for a project
   */
  getProjectRuns(projectId: string): Run[] {
    return database.getRunsByProject(projectId);
  }

  // ==================== PPA Operations ====================

  /**
   * Save PPA metrics for a run
   */
  savePPAMetrics(runId: string, metrics: Omit<PPAMetrics, "id" | "runId">): PPAMetrics {
    return database.savePPAMetrics(runId, metrics);
  }

  /**
   * Get PPA metrics for a run
   */
  getPPAMetrics(runId: string): PPAMetrics | null {
    return database.getPPAMetrics(runId);
  }

  /**
   * Get PPA history for a project
   */
  getPPAHistory(projectId: string): PPAMetrics[] {
    return database.getPPAHistory(projectId);
  }

  // ==================== Utility Operations ====================

  /**
   * Get project size
   */
  getProjectSize(projectId: string): number {
    return fileManager.getProjectSize(projectId);
  }

  /**
   * Format project size for display
   */
  formatProjectSize(projectId: string): string {
    const bytes = fileManager.getProjectSize(projectId);
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  /**
   * Get project summary
   */
  getProjectSummary(projectId: string): string {
    const project = this.getProjectWithDetails(projectId);
    if (!project) return "Project not found";

    const lines: string[] = [
      `Project: ${project.name} (${project.id})`,
      `Design: ${project.designName || "N/A"}`,
      `Top Module: ${project.topModule || "N/A"}`,
      `Created: ${project.createdAt.toISOString()}`,
      `Updated: ${project.updatedAt.toISOString()}`,
      `Runs: ${project.runs.length}`,
      `Files: ${project.files.length}`,
      `Size: ${this.formatProjectSize(projectId)}`,
    ];

    if (project.latestPPA) {
      lines.push("");
      lines.push("Latest PPA Metrics:");
      if (project.latestPPA.areaUm2) lines.push(`  Area: ${project.latestPPA.areaUm2} µm²`);
      if (project.latestPPA.powerMw) lines.push(`  Power: ${project.latestPPA.powerMw} mW`);
      if (project.latestPPA.frequencyMhz) lines.push(`  Frequency: ${project.latestPPA.frequencyMhz} MHz`);
      if (project.latestPPA.wnsNs) lines.push(`  WNS: ${project.latestPPA.wnsNs} ns`);
      if (project.latestPPA.cellCount) lines.push(`  Cells: ${project.latestPPA.cellCount}`);
    }

    return lines.join("\n");
  }
}

// Export singleton instance
export const projectManager = new ProjectManager();
