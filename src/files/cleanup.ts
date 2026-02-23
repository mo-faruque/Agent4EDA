/**
 * Cleanup utilities for old projects
 */

import { database } from "../db/database.js";
import { fileManager } from "./file-manager.js";
import { Project } from "../types/project.js";

/**
 * Cleanup result
 */
export interface CleanupResult {
  projectsDeleted: number;
  bytesFreed: number;
  deletedProjects: string[];
  errors: string[];
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
  daysOld: number;        // Delete projects older than N days
  dryRun?: boolean;       // If true, only report what would be deleted
  keepMinProjects?: number; // Always keep at least N most recent projects
}

/**
 * Clean up old projects
 */
export async function cleanupOldProjects(options: CleanupOptions): Promise<CleanupResult> {
  const { daysOld, dryRun = false, keepMinProjects = 5 } = options;

  const result: CleanupResult = {
    projectsDeleted: 0,
    bytesFreed: 0,
    deletedProjects: [],
    errors: [],
  };

  try {
    // Get old projects
    const oldProjects = database.getOldProjects(daysOld);

    // Get all projects sorted by date
    const allProjects = database.getAllProjects();

    // Calculate how many we can delete (keep minimum)
    const maxToDelete = Math.max(0, allProjects.length - keepMinProjects);

    // Filter old projects to respect keepMinProjects
    const projectsToDelete = oldProjects.slice(0, maxToDelete);

    for (const project of projectsToDelete) {
      try {
        // Calculate size before deletion
        const size = fileManager.getProjectSize(project.id);

        if (!dryRun) {
          // Delete files
          fileManager.deleteProjectFiles(project.id);

          // Delete from database
          database.deleteProject(project.id);
        }

        result.projectsDeleted++;
        result.bytesFreed += size;
        result.deletedProjects.push(project.id);
      } catch (error: any) {
        result.errors.push(`Failed to delete ${project.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    result.errors.push(`Cleanup failed: ${error.message}`);
  }

  return result;
}

/**
 * Get cleanup preview (dry run)
 */
export async function previewCleanup(daysOld: number): Promise<{
  projectsToDelete: Project[];
  totalBytes: number;
}> {
  const oldProjects = database.getOldProjects(daysOld);
  let totalBytes = 0;

  for (const project of oldProjects) {
    totalBytes += fileManager.getProjectSize(project.id);
  }

  return {
    projectsToDelete: oldProjects,
    totalBytes,
  };
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Get cleanup report
 */
export function getCleanupReport(result: CleanupResult): string {
  const lines: string[] = [
    "=== Cleanup Report ===",
    `Projects deleted: ${result.projectsDeleted}`,
    `Space freed: ${formatBytes(result.bytesFreed)}`,
  ];

  if (result.deletedProjects.length > 0) {
    lines.push("");
    lines.push("Deleted projects:");
    for (const id of result.deletedProjects) {
      lines.push(`  - ${id}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  return lines.join("\n");
}
