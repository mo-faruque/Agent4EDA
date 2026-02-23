/**
 * Viewers Tool - GTKWave and KLayout viewers via Docker VNC
 *
 * These viewers run inside the Docker container and are accessible
 * via the VNC web interface at http://localhost:8888
 */

import { dockerManager } from "../docker/docker-manager.js";
import { projectManager } from "../files/project-manager.js";
import { fileManager } from "../files/file-manager.js";

/**
 * Viewer result interface
 */
export interface ViewerResult {
  success: boolean;
  projectId: string;
  message?: string;
  file?: string;
  filePath?: string;
  vncUrl?: string;
  error?: string;
}

/**
 * View waveform with GTKWave
 */
export async function viewWaveform(
  projectId: string,
  vcdFile: string = "output.vcd"
): Promise<ViewerResult> {
  try {
    // Check if project exists
    const project = projectManager.getProject(projectId);
    if (!project) {
      return {
        success: false,
        projectId,
        error: `Project ${projectId} not found. Run a simulation first.`,
      };
    }

    // Ensure Docker container is running
    if (!(await dockerManager.ensureRunning())) {
      return {
        success: false,
        projectId,
        error: "Docker container is not running. Please start the container first.",
      };
    }

    const paths = projectManager.getProjectPaths(projectId);

    // Check if VCD file exists in container
    const vcdPath = `${paths.containerPath}/output/${vcdFile}`;
    const checkCmd = `test -f ${vcdPath} && echo "exists" || echo "not found"`;
    const checkResult = await dockerManager.exec(checkCmd, { workdir: paths.containerPath });

    if (!checkResult.success || checkResult.stdout.includes("not found")) {
      // List available VCD files
      const listCmd = `ls ${paths.containerPath}/output/*.vcd 2>/dev/null | xargs -n1 basename 2>/dev/null || echo "No VCD files found"`;
      const listResult = await dockerManager.exec(listCmd, { workdir: paths.containerPath });

      const availableFiles = listResult.stdout.trim();

      return {
        success: false,
        projectId,
        error: `VCD file '${vcdFile}' not found in project ${projectId}`,
        message: availableFiles.includes("No VCD files") ?
          "No VCD files available. Make sure your testbench includes $dumpfile() and $dumpvars() commands." :
          `Available VCD files: ${availableFiles}`,
      };
    }

    // Launch GTKWave in the container (displays via VNC)
    // Use DISPLAY=:0 which is the VNC display
    const launchCmd = `DISPLAY=:0 gtkwave ${vcdPath} &`;
    const launchResult = await dockerManager.exec(launchCmd, {
      workdir: paths.containerPath,
      timeout: 5000,
    });

    return {
      success: true,
      projectId,
      message: `GTKWave launched for ${vcdFile}. Access via VNC at http://localhost:8888`,
      file: vcdFile,
      filePath: vcdPath,
      vncUrl: "http://localhost:8888",
    };

  } catch (error: any) {
    return {
      success: false,
      projectId,
      error: error.message || String(error),
    };
  }
}

/**
 * View GDS file with KLayout
 */
export async function viewGds(
  projectId: string,
  gdsFile?: string
): Promise<ViewerResult> {
  try {
    // Check if project exists
    const project = projectManager.getProject(projectId);
    if (!project) {
      return {
        success: false,
        projectId,
        error: `Project ${projectId} not found.`,
      };
    }

    // Ensure Docker container is running
    if (!(await dockerManager.ensureRunning())) {
      return {
        success: false,
        projectId,
        error: "Docker container is not running. Please start the container first.",
      };
    }

    const paths = projectManager.getProjectPaths(projectId);
    let gdsPath: string;

    if (gdsFile) {
      // Use specified GDS file
      gdsPath = `${paths.containerPath}/output/${gdsFile}`;
    } else {
      // Auto-find GDS file from OpenLane runs
      const findCmd = `find ${paths.containerPath}/runs -name "*.gds" 2>/dev/null | head -1`;
      const findResult = await dockerManager.exec(findCmd, { workdir: paths.containerPath });

      if (!findResult.success || !findResult.stdout.trim()) {
        // Also check output directory
        const checkOutput = `ls ${paths.containerPath}/output/*.gds 2>/dev/null | head -1`;
        const outputResult = await dockerManager.exec(checkOutput, { workdir: paths.containerPath });

        if (!outputResult.success || !outputResult.stdout.trim()) {
          return {
            success: false,
            projectId,
            error: "No GDS files found. Run OpenLane flow first.",
          };
        }
        gdsPath = outputResult.stdout.trim();
      } else {
        gdsPath = findResult.stdout.trim();
      }
    }

    // Check if GDS file exists
    const checkCmd = `test -f ${gdsPath} && echo "exists" || echo "not found"`;
    const checkResult = await dockerManager.exec(checkCmd, { workdir: paths.containerPath });

    if (!checkResult.success || checkResult.stdout.includes("not found")) {
      return {
        success: false,
        projectId,
        error: `GDS file not found: ${gdsPath}`,
      };
    }

    // Launch KLayout in the container (displays via VNC)
    const launchCmd = `DISPLAY=:0 klayout ${gdsPath} &`;
    const launchResult = await dockerManager.exec(launchCmd, {
      workdir: paths.containerPath,
      timeout: 5000,
    });

    const fileName = gdsPath.split("/").pop();

    return {
      success: true,
      projectId,
      message: `KLayout launched for ${fileName}. Access via VNC at http://localhost:8888`,
      file: fileName,
      filePath: gdsPath,
      vncUrl: "http://localhost:8888",
    };

  } catch (error: any) {
    return {
      success: false,
      projectId,
      error: error.message || String(error),
    };
  }
}

/**
 * List available GDS files in a project
 */
export async function listGdsFiles(projectId: string): Promise<string[]> {
  try {
    const project = projectManager.getProject(projectId);
    if (!project) {
      return [];
    }

    const paths = projectManager.getProjectPaths(projectId);

    // Find all GDS files
    const findCmd = `find ${paths.containerPath} -name "*.gds" 2>/dev/null`;
    const result = await dockerManager.exec(findCmd, { workdir: paths.containerPath });

    if (!result.success || !result.stdout.trim()) {
      return [];
    }

    return result.stdout.trim().split("\n").filter(f => f.endsWith(".gds"));
  } catch {
    return [];
  }
}

/**
 * Open a generic file viewer
 */
export async function openFileViewer(
  projectId: string,
  filePath: string
): Promise<ViewerResult> {
  try {
    const project = projectManager.getProject(projectId);
    if (!project) {
      return {
        success: false,
        projectId,
        error: `Project ${projectId} not found.`,
      };
    }

    if (!(await dockerManager.ensureRunning())) {
      return {
        success: false,
        projectId,
        error: "Docker container is not running.",
      };
    }

    const paths = projectManager.getProjectPaths(projectId);
    const fullPath = filePath.startsWith("/") ? filePath : `${paths.containerPath}/${filePath}`;
    const ext = filePath.split(".").pop()?.toLowerCase();

    let viewer: string;
    switch (ext) {
      case "gds":
      case "gds2":
        viewer = "klayout";
        break;
      case "vcd":
      case "fst":
        viewer = "gtkwave";
        break;
      case "def":
      case "lef":
        viewer = "klayout";
        break;
      default:
        // Use a text editor for other files
        viewer = "gedit";
    }

    const launchCmd = `DISPLAY=:0 ${viewer} ${fullPath} &`;
    await dockerManager.exec(launchCmd, {
      workdir: paths.containerPath,
      timeout: 5000,
    });

    return {
      success: true,
      projectId,
      message: `${viewer} launched for ${filePath}. Access via VNC at http://localhost:8888`,
      file: filePath,
      filePath: fullPath,
      vncUrl: "http://localhost:8888",
    };

  } catch (error: any) {
    return {
      success: false,
      projectId,
      error: error.message || String(error),
    };
  }
}

/**
 * Get VNC connection info
 */
export function getVncInfo(): {
  url: string;
  port: number;
  directPort: number;
  password: string;
  instructions: string;
} {
  return {
    url: "http://localhost:8888",
    port: 8888,
    directPort: 5901,
    password: "abc123",
    instructions: "Open http://localhost:8888 in your browser. Password: abc123",
  };
}

/**
 * Format viewer result for MCP response
 */
export function formatViewerResult(result: ViewerResult): string {
  const vncInfo = getVncInfo();

  return JSON.stringify({
    success: result.success,
    project_id: result.projectId,
    message: result.message,
    file: result.file,
    file_path: result.filePath,
    vnc_url: result.vncUrl || vncInfo.url,
    vnc_info: result.success ? {
      url: vncInfo.url,
      password: vncInfo.password,
      instructions: vncInfo.instructions,
    } : undefined,
    error: result.error,
  }, null, 2);
}
