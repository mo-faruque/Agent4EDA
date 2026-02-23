/**
 * Simulation Tool - Refactored for Docker execution
 *
 * Simulates Verilog code using Icarus Verilog running in the Docker container
 */

import { dockerManager } from "../docker/docker-manager.js";
import { projectManager } from "../files/project-manager.js";
import { pathResolver } from "../files/path-resolver.js";
import { fileManager } from "../files/file-manager.js";

/**
 * Simulation result interface
 */
export interface SimulationResult {
  success: boolean;
  projectId: string;
  runId?: string;
  compileStdout?: string;
  compileStderr?: string;
  simStdout?: string;
  simStderr?: string;
  vcdFile?: string;
  vcdContainerPath?: string;
  hostPath?: string;
  containerPath?: string;
  error?: string;
}

/**
 * Simulation options
 */
export interface SimulationOptions {
  verilogCode: string;
  testbenchCode: string;
  projectId?: string;  // Optional: use existing project
  projectName?: string; // Optional: name for new project
  vcdFilename?: string; // Optional: VCD output filename
}

/**
 * Simulate Verilog code using Icarus Verilog in Docker
 */
export async function simulateVerilog(options: SimulationOptions): Promise<SimulationResult> {
  const { verilogCode, testbenchCode, vcdFilename = "output.vcd" } = options;

  try {
    // Ensure Docker container is running
    if (!(await dockerManager.ensureRunning())) {
      return {
        success: false,
        projectId: "",
        error: "Docker container is not running. Please start the container first.",
      };
    }

    // Create or get project
    let projectId = options.projectId;
    let hostPath: string;
    let containerPath: string;

    if (projectId) {
      // Use existing project
      const project = projectManager.getProject(projectId);
      if (!project) {
        return {
          success: false,
          projectId: projectId,
          error: `Project ${projectId} not found`,
        };
      }
      const paths = projectManager.getProjectPaths(projectId);
      hostPath = paths.hostPath;
      containerPath = paths.containerPath;
    } else {
      // Create new project
      const result = projectManager.createProject({
        name: options.projectName || `sim_${Date.now()}`,
        designName: "simulation",
      });
      projectId = result.project.id;
      hostPath = result.hostPath;
      containerPath = result.containerPath;
    }

    // Create a run for this simulation
    const run = projectManager.createRun({
      projectId,
      runType: "simulation",
      config: { vcdFilename },
    });
    projectManager.startRun(run.id);

    // Write the Verilog design and testbench files
    projectManager.writeDesignFile(projectId, "design.v", verilogCode, run.id);
    fileManager.writeFile(projectId, "testbench.v", testbenchCode, "input", run.id);

    // Compile with Icarus Verilog in Docker
    const compileCmd = `cd ${containerPath}/src && iverilog -o ${containerPath}/output/simulation design.v testbench.v 2>&1`;
    const compileResult = await dockerManager.exec(compileCmd, {
      workdir: containerPath,
      timeout: 60000,
    });

    if (!compileResult.success) {
      projectManager.failRun(run.id, compileResult.stderr);
      return {
        success: false,
        projectId,
        runId: run.id,
        compileStdout: compileResult.stdout,
        compileStderr: compileResult.stderr,
        hostPath,
        containerPath,
        error: `Compilation failed: ${compileResult.stderr}`,
      };
    }

    // Run the simulation with vvp (set LD_LIBRARY_PATH for libvvp.so)
    const simCmd = `cd ${containerPath}/output && LD_LIBRARY_PATH=/foss/tools/iverilog/lib:$LD_LIBRARY_PATH vvp simulation 2>&1`;
    const simResult = await dockerManager.exec(simCmd, {
      workdir: containerPath,
      timeout: 120000,
    });

    // Check if VCD file was generated
    let vcdFile: string | undefined;
    let vcdContainerPath: string | undefined;

    const checkVcdCmd = `ls -la ${containerPath}/output/*.vcd 2>/dev/null || echo "No VCD files"`;
    const vcdCheck = await dockerManager.exec(checkVcdCmd, { workdir: containerPath });

    if (vcdCheck.success && !vcdCheck.stdout.includes("No VCD files")) {
      // Extract VCD filename from ls output
      const vcdMatch = vcdCheck.stdout.match(/(\S+\.vcd)/);
      if (vcdMatch) {
        vcdFile = vcdMatch[1].split("/").pop();
        vcdContainerPath = `${containerPath}/output/${vcdFile}`;
      }
    }

    // Update run status
    if (simResult.success) {
      projectManager.completeRun(run.id, {
        vcdFile,
        hasVcd: !!vcdFile,
      });
    } else {
      projectManager.failRun(run.id, simResult.stderr);
    }

    return {
      success: simResult.success,
      projectId,
      runId: run.id,
      compileStdout: compileResult.stdout,
      compileStderr: compileResult.stderr,
      simStdout: simResult.stdout,
      simStderr: simResult.stderr,
      vcdFile,
      vcdContainerPath,
      hostPath,
      containerPath,
      error: simResult.success ? undefined : simResult.stderr,
    };

  } catch (error: any) {
    return {
      success: false,
      projectId: options.projectId || "",
      error: error.message || String(error),
    };
  }
}

/**
 * List VCD files in a project
 */
export async function listVcdFiles(projectId: string): Promise<string[]> {
  try {
    const paths = projectManager.getProjectPaths(projectId);
    const listCmd = `ls ${paths.containerPath}/output/*.vcd 2>/dev/null | xargs -n1 basename`;
    const result = await dockerManager.exec(listCmd, { workdir: paths.containerPath });

    if (result.success && result.stdout.trim()) {
      return result.stdout.trim().split("\n").filter(f => f.endsWith(".vcd"));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Format simulation result for MCP response
 */
export function formatSimulationResult(result: SimulationResult): string {
  return JSON.stringify({
    project_id: result.projectId,
    run_id: result.runId,
    success: result.success,
    host_path: result.hostPath,
    container_path: result.containerPath,
    vcd_file: result.vcdFile,
    vcd_container_path: result.vcdContainerPath,
    compile_stdout: result.compileStdout,
    compile_stderr: result.compileStderr,
    sim_stdout: result.simStdout ?
      (result.simStdout.length > 5000 ? result.simStdout.substring(0, 5000) + "...(truncated)" : result.simStdout) :
      undefined,
    sim_stderr: result.simStderr,
    error: result.error,
    note: result.success ?
      `Simulation completed. ${result.vcdFile ? `VCD file generated: ${result.vcdFile}. Use view_waveform with project_id '${result.projectId}' to open GTKWave via VNC.` : "No VCD file generated. Make sure your testbench includes $dumpfile() and $dumpvars() commands."}` :
      "Simulation failed. Check the error message for details."
  }, null, 2);
}
