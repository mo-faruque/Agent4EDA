/**
 * Docker Manager - Handles container lifecycle and command execution
 *
 * This module manages the IIC-OSIC-TOOLS Docker container that runs
 * all EDA tools (Yosys, iverilog, OpenLane, etc.)
 */

import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Configuration
const DEFAULT_CONTAINER_NAME = process.env.DOCKER_CONTAINER_NAME || "mcp4eda";
const DEFAULT_IMAGE = "mcp4eda:latest";
const DOCKER_COMPOSE_PATH = "./docker/docker-compose.yml";

// Timeout settings
const COMMAND_TIMEOUT = 120_000; // 2 minutes for regular commands
const LONG_COMMAND_TIMEOUT = 600_000; // 10 minutes for OpenLane
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB

export interface DockerExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ContainerStatus {
  running: boolean;
  id?: string;
  image?: string;
  status?: string;
  health?: string;
}

/**
 * DockerManager class - Singleton for managing the EDA container
 */
export class DockerManager {
  private static instance: DockerManager;
  private containerName: string;
  private imageName: string;

  private constructor(containerName = DEFAULT_CONTAINER_NAME, imageName = DEFAULT_IMAGE) {
    this.containerName = containerName;
    this.imageName = imageName;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DockerManager {
    if (!DockerManager.instance) {
      DockerManager.instance = new DockerManager();
    }
    return DockerManager.instance;
  }

  /**
   * Check if Docker is available on the system
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker --version", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(): Promise<ContainerStatus> {
    try {
      // Use double quotes for Windows compatibility
      const { stdout } = await execAsync(
        `docker inspect --format "{{.State.Running}},{{.Id}},{{.Config.Image}},{{.State.Status}}" ${this.containerName}`,
        { timeout: 10000 }
      );

      const parts = stdout.trim().split(",");
      return {
        running: parts[0] === "true",
        id: parts[1]?.substring(0, 12),
        image: parts[2],
        status: parts[3],
        health: "unknown"
      };
    } catch {
      return { running: false };
    }
  }

  /**
   * Check if container is running
   */
  async isContainerRunning(): Promise<boolean> {
    const status = await this.getContainerStatus();
    return status.running;
  }

  /**
   * Start the container using docker-compose
   */
  async startContainer(): Promise<DockerExecResult> {
    try {
      const { stdout, stderr } = await execAsync(
        `docker-compose -f ${DOCKER_COMPOSE_PATH} up -d`,
        {
          timeout: 120000,
          maxBuffer: MAX_BUFFER
        }
      );

      // Wait a moment for container to be ready
      await this.waitForContainer(30000);

      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: "",
        stderr: error.message || String(error),
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Stop the container
   */
  async stopContainer(): Promise<DockerExecResult> {
    try {
      const { stdout, stderr } = await execAsync(
        `docker-compose -f ${DOCKER_COMPOSE_PATH} down`,
        { timeout: 60000 }
      );

      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: "",
        stderr: error.message || String(error),
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Wait for container to be ready
   */
  async waitForContainer(timeoutMs = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isContainerRunning()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return false;
  }

  /**
   * Execute a command in the container
   */
  async exec(
    command: string,
    options: {
      workdir?: string;
      timeout?: number;
      env?: Record<string, string>;
    } = {}
  ): Promise<DockerExecResult> {
    const timeout = options.timeout || COMMAND_TIMEOUT;
    const workdir = options.workdir || "/workspace";

    // Build docker exec command
    let dockerCmd = `docker exec`;

    // Add working directory
    dockerCmd += ` -w ${workdir}`;

    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        dockerCmd += ` -e ${key}="${value}"`;
      }
    }

    // Add container name and command
    dockerCmd += ` ${this.containerName} /bin/bash -c "${command.replace(/"/g, '\\"')}"`;

    return this.runCommand(dockerCmd, timeout);
  }

  /**
   * Execute a long-running command (like OpenLane)
   */
  async execLong(
    command: string,
    options: {
      workdir?: string;
      timeout?: number;
      onOutput?: (data: string) => void;
    } = {}
  ): Promise<DockerExecResult> {
    const timeout = options.timeout || LONG_COMMAND_TIMEOUT;
    const workdir = options.workdir || "/workspace";

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const timeoutHandle = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      const child: ChildProcess = spawn("docker", [
        "exec",
        "-w", workdir,
        this.containerName,
        "/bin/bash", "-c", command
      ], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        options.onOutput?.(text);
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        options.onOutput?.(text);
      });

      child.on("close", (code) => {
        clearTimeout(timeoutHandle);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      child.on("error", (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Run a shell command on the host
   */
  private async runCommand(command: string, timeout: number): Promise<DockerExecResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8"
      });

      return {
        success: true,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: error.stdout?.toString() || "",
        stderr: error.stderr?.toString() || error.message || String(error),
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Copy file from host to container
   */
  async copyToContainer(hostPath: string, containerPath: string): Promise<DockerExecResult> {
    return this.runCommand(
      `docker cp "${hostPath}" ${this.containerName}:${containerPath}`,
      COMMAND_TIMEOUT
    );
  }

  /**
   * Copy file from container to host
   */
  async copyFromContainer(containerPath: string, hostPath: string): Promise<DockerExecResult> {
    return this.runCommand(
      `docker cp ${this.containerName}:${containerPath} "${hostPath}"`,
      COMMAND_TIMEOUT
    );
  }

  /**
   * Check if a tool is available in the container
   */
  async isToolAvailable(toolName: string): Promise<boolean> {
    const result = await this.exec(`which ${toolName}`);
    return result.success;
  }

  /**
   * Get versions of all EDA tools
   */
  async getToolVersions(): Promise<Record<string, string>> {
    const tools: Record<string, string> = {};

    // Yosys
    const yosys = await this.exec("yosys -V");
    if (yosys.success) {
      tools.yosys = yosys.stdout.trim().split("\n")[0];
    }

    // Icarus Verilog
    const iverilog = await this.exec("iverilog -V 2>&1 | head -1");
    if (iverilog.success) {
      tools.iverilog = iverilog.stdout.trim();
    }

    // OpenLane
    const openlane = await this.exec("python3 -m openlane --version 2>&1");
    if (openlane.success) {
      tools.openlane = openlane.stdout.trim();
    }

    // OpenROAD
    const openroad = await this.exec("openroad -version 2>&1 | head -1");
    if (openroad.success) {
      tools.openroad = openroad.stdout.trim();
    }

    // Magic
    const magic = await this.exec("magic -dnull -noconsole --version 2>&1");
    if (magic.success) {
      tools.magic = magic.stdout.trim();
    }

    return tools;
  }

  /**
   * Ensure container is running, start if needed
   */
  async ensureRunning(): Promise<boolean> {
    const wasRunning = await this.isContainerRunning();

    if (!wasRunning) {
      console.error("Container not running, starting...");
      const result = await this.startContainer();

      if (!result.success) {
        console.error("Failed to start container:", result.stderr);
        return false;
      }

      const started = await this.waitForContainer();
      if (!started) {
        return false;
      }
    }

    // Apply container fixes (missing symlinks, etc.)
    await this.applyContainerFixes();

    return true;
  }

  /**
   * Apply fixes to the container environment
   * These fix missing symlinks and other configuration issues
   */
  private async applyContainerFixes(): Promise<void> {
    try {
      // Fix klayout not in PATH - create symlink if missing
      // This is needed because LibreLane's XOR check calls 'klayout' expecting it in PATH
      await this.runCommand(
        `docker exec ${this.containerName} /bin/bash -c "[ -L /foss/tools/bin/klayout ] || ln -sf /foss/tools/klayout/klayout /foss/tools/bin/klayout"`,
        5000
      );
    } catch {
      // Ignore errors - these are best-effort fixes
    }
  }
}

// Export singleton instance
export const dockerManager = DockerManager.getInstance();
