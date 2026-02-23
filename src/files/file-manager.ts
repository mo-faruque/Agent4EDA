/**
 * FileManager - Handles file operations for projects
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { pathResolver } from "./path-resolver.js";
import { database } from "../db/database.js";
import { FileType, TrackedFile } from "../types/project.js";

/**
 * File operation result
 */
export interface FileResult {
  success: boolean;
  hostPath?: string;
  containerPath?: string;
  error?: string;
}

/**
 * FileManager handles all file operations
 */
class FileManager {
  /**
   * Ensure the projects directory exists
   */
  ensureProjectsDir(): void {
    const projectsDir = pathResolver.getHostProjectsDir();
    if (!existsSync(projectsDir)) {
      mkdirSync(projectsDir, { recursive: true });
    }
  }

  /**
   * Create a project directory
   */
  createProjectDir(projectId: string): string {
    const projectDir = pathResolver.getProjectHostPath(projectId);
    if (!existsSync(projectDir)) {
      mkdirSync(projectDir, { recursive: true });
    }

    // Create subdirectories
    // Note: "reports" removed - LibreLane stores reports in step directories and final/metrics.json
    const subdirs = ["src", "output", "runs"];
    for (const subdir of subdirs) {
      const subdirPath = join(projectDir, subdir);
      if (!existsSync(subdirPath)) {
        mkdirSync(subdirPath, { recursive: true });
      }
    }

    return projectDir;
  }

  /**
   * Write a file to a project
   */
  writeFile(
    projectId: string,
    filename: string,
    content: string,
    fileType: FileType,
    runId?: string
  ): FileResult {
    try {
      this.ensureProjectsDir();
      this.createProjectDir(projectId);

      // Determine subdirectory based on file type
      const subdir = this.getSubdirForType(fileType);
      const filePath = join(pathResolver.getProjectHostPath(projectId), subdir, filename);

      // Ensure parent directory exists
      const parentDir = dirname(filePath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      // Write file
      writeFileSync(filePath, content, "utf-8");

      // Track in database
      const relativePath = join(projectId, subdir, filename);
      database.trackFile(projectId, fileType, relativePath, runId);

      return {
        success: true,
        hostPath: filePath,
        containerPath: pathResolver.hostToContainer(filePath),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Read a file from a project
   */
  readFile(projectId: string, filename: string): string | null {
    try {
      // Try different subdirectories
      const subdirs = ["src", "output", "runs", ""];
      for (const subdir of subdirs) {
        const filePath = join(pathResolver.getProjectHostPath(projectId), subdir, filename);
        if (existsSync(filePath)) {
          return readFileSync(filePath, "utf-8");
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Read a file by its full path (host or container)
   */
  readFileByPath(filePath: string): string | null {
    try {
      let hostPath = filePath;

      // Convert container path to host path if needed
      if (pathResolver.isContainerPath(filePath)) {
        hostPath = pathResolver.containerToHost(filePath);
      }

      if (existsSync(hostPath)) {
        return readFileSync(hostPath, "utf-8");
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a file exists
   */
  fileExists(projectId: string, filename: string): boolean {
    const subdirs = ["src", "output", "runs", ""];
    for (const subdir of subdirs) {
      const filePath = join(pathResolver.getProjectHostPath(projectId), subdir, filename);
      if (existsSync(filePath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * List files in a project
   */
  listFiles(projectId: string, subdir?: string): string[] {
    try {
      const projectDir = pathResolver.getProjectHostPath(projectId);
      const searchDir = subdir ? join(projectDir, subdir) : projectDir;

      if (!existsSync(searchDir)) {
        return [];
      }

      return this.listFilesRecursive(searchDir, projectDir);
    } catch (error) {
      return [];
    }
  }

  /**
   * List files recursively
   */
  private listFilesRecursive(dir: string, baseDir: string): string[] {
    const files: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.listFilesRecursive(fullPath, baseDir));
      } else {
        // Return relative path from project directory
        files.push(fullPath.slice(baseDir.length + 1).replace(/\\/g, "/"));
      }
    }

    return files;
  }

  /**
   * Get tracked files from database
   */
  getTrackedFiles(projectId: string): TrackedFile[] {
    return database.getFilesByProject(projectId);
  }

  /**
   * Delete a project's files
   */
  deleteProjectFiles(projectId: string): boolean {
    try {
      const projectDir = pathResolver.getProjectHostPath(projectId);
      if (existsSync(projectDir)) {
        rmSync(projectDir, { recursive: true, force: true });
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get project size in bytes
   */
  getProjectSize(projectId: string): number {
    try {
      const projectDir = pathResolver.getProjectHostPath(projectId);
      if (!existsSync(projectDir)) {
        return 0;
      }
      return this.getDirSize(projectDir);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get directory size recursively
   */
  private getDirSize(dir: string): number {
    let size = 0;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        size += this.getDirSize(fullPath);
      } else {
        size += statSync(fullPath).size;
      }
    }

    return size;
  }

  /**
   * Get subdirectory for file type
   */
  private getSubdirForType(fileType: FileType): string {
    switch (fileType) {
      case "input":
        return "src";
      case "output":
        return "output";
      case "report":
        return "output";  // LibreLane stores reports in step directories, not a central reports folder
      case "gds":
        return "output";
      case "vcd":
        return "output";
      case "config":
        return "";  // Config files at project root
      case "constraint":
        return "";  // Constraint SDC files at project root (next to config.json)
      default:
        return "";
    }
  }

  /**
   * Detect file type from extension
   */
  detectFileType(filename: string): FileType {
    const ext = extname(filename).toLowerCase();

    switch (ext) {
      case ".v":
      case ".sv":
      case ".vhd":
      case ".vhdl":
        return "input";
      case ".gds":
      case ".gds2":
        return "gds";
      case ".vcd":
      case ".fst":
        return "vcd";
      case ".sdc":
        return "constraint";  // SDC timing constraint files
      case ".json":
      case ".yaml":
      case ".yml":
      case ".tcl":
        return "config";
      case ".rpt":
      case ".log":
      case ".txt":
        return "report";
      default:
        return "output";
    }
  }
}

// Export singleton instance
export const fileManager = new FileManager();
