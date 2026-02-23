/**
 * Path Resolver - Converts between host and container paths
 */

import { join, resolve, normalize, sep, dirname } from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Calculate the MCP4EDA root directory (two levels up from src/files/)
const MCP4EDA_ROOT = resolve(__dirname, "..", "..");

/**
 * Path configuration
 */
export interface PathConfig {
  hostProjectsDir: string;      // Host path to projects directory
  containerProjectsDir: string; // Container path to projects directory
  containerName: string;        // Docker container name
}

/**
 * Default configuration
 * Uses MCP4EDA_ROOT to ensure consistent paths regardless of working directory
 * (fixes issue when running from Claude Desktop vs Claude Code CLI)
 */
const defaultConfig: PathConfig = {
  hostProjectsDir: process.env.MCP4EDA_PROJECTS_DIR || join(MCP4EDA_ROOT, "projects"),
  containerProjectsDir: "/workspace/projects",
  containerName: process.env.DOCKER_CONTAINER_NAME || "mcp4eda",
};

/**
 * PathResolver handles path translation between host and container
 */
class PathResolver {
  private config: PathConfig;

  constructor(config: Partial<PathConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Get the host projects directory
   */
  getHostProjectsDir(): string {
    return resolve(this.config.hostProjectsDir);
  }

  /**
   * Get the container projects directory
   */
  getContainerProjectsDir(): string {
    return this.config.containerProjectsDir;
  }

  /**
   * Get the container name
   */
  getContainerName(): string {
    return this.config.containerName;
  }

  /**
   * Convert a host path to a container path
   */
  hostToContainer(hostPath: string): string {
    const normalizedHostPath = normalize(resolve(hostPath));
    const normalizedHostProjectsDir = normalize(this.getHostProjectsDir());

    // Check if the path is within the projects directory
    if (!normalizedHostPath.startsWith(normalizedHostProjectsDir)) {
      throw new Error(
        `Path ${hostPath} is not within the projects directory ${this.config.hostProjectsDir}`
      );
    }

    // Get relative path from projects dir
    const relativePath = normalizedHostPath.slice(normalizedHostProjectsDir.length);

    // Convert to container path (use forward slashes)
    const containerPath = this.config.containerProjectsDir + relativePath.replace(/\\/g, "/");

    return containerPath;
  }

  /**
   * Convert a container path to a host path
   */
  containerToHost(containerPath: string): string {
    // Check if the path is within the container projects directory
    if (!containerPath.startsWith(this.config.containerProjectsDir)) {
      throw new Error(
        `Path ${containerPath} is not within the container projects directory ${this.config.containerProjectsDir}`
      );
    }

    // Get relative path from container projects dir
    const relativePath = containerPath.slice(this.config.containerProjectsDir.length);

    // Convert to host path
    const hostPath = join(this.getHostProjectsDir(), relativePath.replace(/\//g, sep));

    return hostPath;
  }

  /**
   * Get the host path for a project
   */
  getProjectHostPath(projectId: string): string {
    return join(this.getHostProjectsDir(), projectId);
  }

  /**
   * Get the container path for a project
   */
  getProjectContainerPath(projectId: string): string {
    return `${this.config.containerProjectsDir}/${projectId}`;
  }

  /**
   * Get host path for a file within a project
   */
  getFileHostPath(projectId: string, filename: string): string {
    return join(this.getProjectHostPath(projectId), filename);
  }

  /**
   * Get container path for a file within a project
   */
  getFileContainerPath(projectId: string, filename: string): string {
    return `${this.getProjectContainerPath(projectId)}/${filename}`;
  }

  /**
   * Check if a path is a container path
   */
  isContainerPath(path: string): boolean {
    return path.startsWith("/workspace") || path.startsWith("/foss");
  }

  /**
   * Normalize a path for the current platform
   */
  normalizePath(path: string): string {
    if (this.isContainerPath(path)) {
      // Container paths use forward slashes
      return path.replace(/\\/g, "/");
    } else {
      // Host paths use platform-specific separator
      return normalize(path);
    }
  }
}

// Export singleton instance
export const pathResolver = new PathResolver();

// Export class for custom configurations
export { PathResolver };
