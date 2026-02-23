/**
 * Synthesis Tool - Refactored for Docker execution
 *
 * Synthesizes Verilog code using Yosys running in the Docker container
 */

import { dockerManager } from "../docker/docker-manager.js";
import { projectManager } from "../files/project-manager.js";
import { pathResolver } from "../files/path-resolver.js";
import { fileManager } from "../files/file-manager.js";

/**
 * Synthesis result interface
 */
export interface SynthesisResult {
  success: boolean;
  projectId: string;
  runId?: string;
  stdout?: string;
  stderr?: string;
  synthesizedVerilog?: string;
  target: string;
  hostPath?: string;
  containerPath?: string;
  error?: string;
  statistics?: {
    cells?: number;
    wires?: number;
    wireBits?: number;
    publicWires?: number;
    publicWireBits?: number;
    memories?: number;
    memoryBits?: number;
    processes?: number;
    modules?: number;
    cellBreakdown?: Record<string, number>;
  };
}

/**
 * Synthesis options
 */
export interface SynthesisOptions {
  verilogCode?: string;       // Verilog code as string
  verilogFiles?: string[];    // OR: array of Verilog file paths
  topModule: string;
  target?: "generic" | "ice40" | "xilinx" | "sky130";
  projectId?: string;  // Optional: use existing project
  projectName?: string; // Optional: name for new project
}

/**
 * Synthesize Verilog code using Yosys in Docker
 */
export async function synthesizeVerilog(options: SynthesisOptions): Promise<SynthesisResult> {
  const { verilogCode, verilogFiles, topModule, target = "generic" } = options;

  // Validate input - must have either verilogCode or verilogFiles
  if (!verilogCode && (!verilogFiles || verilogFiles.length === 0)) {
    return {
      success: false,
      projectId: "",
      target,
      error: "Either 'verilog_code' or 'verilog_files' must be provided",
    };
  }

  // Convert container paths to host paths if needed
  let resolvedFiles = verilogFiles;
  if (verilogFiles && verilogFiles.length > 0) {
    resolvedFiles = verilogFiles.map(filePath => {
      if (pathResolver.isContainerPath(filePath)) {
        try {
          return pathResolver.containerToHost(filePath);
        } catch {
          // If conversion fails, return original path and let it fail with clearer error
          return filePath;
        }
      }
      return filePath;
    });
  }

  try {
    // Ensure Docker container is running
    if (!(await dockerManager.ensureRunning())) {
      return {
        success: false,
        projectId: "",
        target,
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
          target,
          error: `Project ${projectId} not found`,
        };
      }
      const paths = projectManager.getProjectPaths(projectId);
      hostPath = paths.hostPath;
      containerPath = paths.containerPath;
    } else {
      // Create new project
      const result = projectManager.createProject({
        name: options.projectName || `synth_${Date.now()}`,
        designName: topModule,
        topModule,
      });
      projectId = result.project.id;
      hostPath = result.hostPath;
      containerPath = result.containerPath;
    }

    // Create a run for this synthesis
    const run = projectManager.createRun({
      projectId,
      runType: "synthesis",
      config: { target, topModule },
    });
    projectManager.startRun(run.id);

    // Write the Verilog file(s)
    if (verilogCode) {
      // Single code string provided
      projectManager.writeDesignFile(projectId, "design.v", verilogCode, run.id);
    } else if (resolvedFiles && resolvedFiles.length > 0) {
      // File paths provided - read and copy files
      const fs = await import("fs");
      const path = await import("path");

      for (const filePath of resolvedFiles) {
        try {
          let content: string;
          const fileName = path.basename(filePath);

          // Check if this is a container path - read from container instead
          if (pathResolver.isContainerPath(filePath)) {
            // Read file from inside Docker container
            const catResult = await dockerManager.exec(`cat "${filePath}"`, { timeout: 10000 });
            if (!catResult.success) {
              return {
                success: false,
                projectId,
                runId: run.id,
                target,
                error: `Failed to read container file ${filePath}: ${catResult.stderr}`,
              };
            }
            content = catResult.stdout;
          } else {
            // Read from host filesystem
            content = fs.readFileSync(filePath, "utf-8");
          }

          projectManager.writeDesignFile(projectId, fileName, content, run.id);
        } catch (err: any) {
          return {
            success: false,
            projectId,
            runId: run.id,
            target,
            error: `Failed to read file ${filePath}: ${err.message}`,
          };
        }
      }
    }

    // Generate synthesis script based on target
    const synthScript = generateSynthScript(topModule, target, resolvedFiles);
    fileManager.writeFile(projectId, "synth.ys", synthScript, "config", run.id);

    // Run Yosys in Docker container
    const yosysCmd = `cd ${containerPath}/src && yosys -s ../synth.ys 2>&1`;
    const result = await dockerManager.exec(yosysCmd, {
      workdir: containerPath,
      timeout: 120000,
    });

    // Read synthesized output if successful
    let synthesizedVerilog = "";
    if (result.success) {
      const synthOutput = fileManager.readFile(projectId, "synth_output.v");
      if (synthOutput) {
        synthesizedVerilog = synthOutput;
        // Move output to output directory
        fileManager.writeFile(projectId, "synth_output.v", synthOutput, "output", run.id);
      }
    }

    // Parse statistics from output
    const statistics = parseYosysStats(result.stdout);

    // Update run status
    if (result.success) {
      projectManager.completeRun(run.id, {
        statistics,
        synthesizedVerilog: synthesizedVerilog ? "generated" : "not generated",
      });
    } else {
      projectManager.failRun(run.id, result.stderr);
    }

    return {
      success: result.success,
      projectId,
      runId: run.id,
      stdout: result.stdout,
      stderr: result.stderr,
      synthesizedVerilog,
      target,
      hostPath,
      containerPath,
      statistics,
      error: result.success ? undefined : result.stderr,
    };

  } catch (error: any) {
    return {
      success: false,
      projectId: options.projectId || "",
      target,
      error: error.message || String(error),
    };
  }
}

/**
 * Generate Yosys synthesis script
 */
function generateSynthScript(topModule: string, target: string, verilogFiles?: string[]): string {
  // Generate read commands for Verilog files
  let readCommands: string;
  if (verilogFiles && verilogFiles.length > 0) {
    // Read each file by its basename - extract filename from path without require
    readCommands = verilogFiles
      .map(f => {
        const parts = f.replace(/\\/g, '/').split('/');
        return `read_verilog ${parts[parts.length - 1]}`;
      })
      .join("\n");
  } else {
    readCommands = "read_verilog design.v";
  }

  let script = `# Yosys Synthesis Script
# Target: ${target}
# Top Module: ${topModule}

${readCommands}
hierarchy -check -top ${topModule}
`;

  switch (target.toLowerCase()) {
    case "ice40":
      script += `
synth_ice40 -top ${topModule}
clean
write_verilog -noattr ../synth_output.v
stat
`;
      break;

    case "xilinx":
      script += `
synth_xilinx -top ${topModule}
clean
write_verilog -noattr ../synth_output.v
stat
`;
      break;

    case "sky130":
      script += `
synth -top ${topModule}
dfflibmap -liberty /foss/pdks/sky130A/libs.ref/sky130_fd_sc_hd/lib/sky130_fd_sc_hd__tt_025C_1v80.lib
abc -liberty /foss/pdks/sky130A/libs.ref/sky130_fd_sc_hd/lib/sky130_fd_sc_hd__tt_025C_1v80.lib
clean
write_verilog -noattr ../synth_output.v
stat
`;
      break;

    default: // generic
      script += `
synth -top ${topModule}
techmap
opt
clean
write_verilog -noattr ../synth_output.v
stat
`;
  }

  return script;
}

/**
 * Extended statistics from Yosys
 */
interface YosysStatistics {
  cells?: number;
  wires?: number;
  modules?: number;
  wireBits?: number;
  publicWires?: number;
  publicWireBits?: number;
  memories?: number;
  memoryBits?: number;
  processes?: number;
  cellBreakdown?: Record<string, number>;
}

/**
 * Parse Yosys statistics from output
 */
function parseYosysStats(output: string): YosysStatistics {
  const stats: YosysStatistics = {};

  // Parse cell count
  const cellMatch = output.match(/Number of cells:\s*(\d+)/i);
  if (cellMatch) {
    stats.cells = parseInt(cellMatch[1], 10);
  }

  // Parse wire count
  const wireMatch = output.match(/Number of wires:\s*(\d+)/i);
  if (wireMatch) {
    stats.wires = parseInt(wireMatch[1], 10);
  }

  // Parse wire bits
  const wireBitsMatch = output.match(/Number of wire bits:\s*(\d+)/i);
  if (wireBitsMatch) {
    stats.wireBits = parseInt(wireBitsMatch[1], 10);
  }

  // Parse public wires
  const publicWiresMatch = output.match(/Number of public wires:\s*(\d+)/i);
  if (publicWiresMatch) {
    stats.publicWires = parseInt(publicWiresMatch[1], 10);
  }

  // Parse public wire bits
  const publicWireBitsMatch = output.match(/Number of public wire bits:\s*(\d+)/i);
  if (publicWireBitsMatch) {
    stats.publicWireBits = parseInt(publicWireBitsMatch[1], 10);
  }

  // Parse memories
  const memoriesMatch = output.match(/Number of memories:\s*(\d+)/i);
  if (memoriesMatch) {
    stats.memories = parseInt(memoriesMatch[1], 10);
  }

  // Parse memory bits
  const memoryBitsMatch = output.match(/Number of memory bits:\s*(\d+)/i);
  if (memoryBitsMatch) {
    stats.memoryBits = parseInt(memoryBitsMatch[1], 10);
  }

  // Parse processes
  const processesMatch = output.match(/Number of processes:\s*(\d+)/i);
  if (processesMatch) {
    stats.processes = parseInt(processesMatch[1], 10);
  }

  // Parse module count
  const moduleMatch = output.match(/Number of modules:\s*(\d+)/i);
  if (moduleMatch) {
    stats.modules = parseInt(moduleMatch[1], 10);
  }

  // Parse cell breakdown (e.g., "sky130_fd_sc_hd__inv_2    123")
  const cellBreakdown: Record<string, number> = {};
  const cellBreakdownRegex = /^\s+(sky130_\w+|\$\w+|[A-Z_]+\d*)\s+(\d+)\s*$/gm;
  let match;
  while ((match = cellBreakdownRegex.exec(output)) !== null) {
    cellBreakdown[match[1]] = parseInt(match[2], 10);
  }
  if (Object.keys(cellBreakdown).length > 0) {
    stats.cellBreakdown = cellBreakdown;
  }

  return stats;
}

/**
 * Extract final statistics section from Yosys output
 */
function extractFinalStats(output: string): string | null {
  // Find the last "=== <module> ===" section followed by statistics
  const sections = output.split(/===\s+\w+\s+===/);
  if (sections.length > 1) {
    const lastSection = sections[sections.length - 1];
    // Extract from "Number of" to the end or next major section
    const statsMatch = lastSection.match(/(Number of[\s\S]*?)(?:Yosys|$)/i);
    if (statsMatch) {
      return statsMatch[1].trim();
    }
  }

  // Fallback: look for stat block
  const statMatch = output.match(/Printing statistics\.\s*([\s\S]*?)(?:\n\n|Yosys|$)/i);
  if (statMatch) {
    return statMatch[1].trim();
  }

  return null;
}

/**
 * Format synthesis result for MCP response
 */
export function formatSynthesisResult(result: SynthesisResult): string {
  // Build summary section
  let summary = "";
  if (result.success && result.statistics) {
    const stats = result.statistics;
    summary = "\n=== SYNTHESIS SUMMARY ===\n";
    summary += `Target: ${result.target}\n`;
    if (stats.cells !== undefined) summary += `Total Cells: ${stats.cells}\n`;
    if (stats.wires !== undefined) summary += `Total Wires: ${stats.wires}\n`;
    if (stats.wireBits !== undefined) summary += `Wire Bits: ${stats.wireBits}\n`;
    if (stats.memories !== undefined) summary += `Memories: ${stats.memories}\n`;
    if (stats.memoryBits !== undefined) summary += `Memory Bits: ${stats.memoryBits}\n`;

    // Cell breakdown (top 10 by count)
    if (stats.cellBreakdown && Object.keys(stats.cellBreakdown).length > 0) {
      summary += "\nCell Type Breakdown:\n";
      const sorted = Object.entries(stats.cellBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      for (const [cell, count] of sorted) {
        summary += `  ${cell}: ${count}\n`;
      }
      if (Object.keys(stats.cellBreakdown).length > 10) {
        summary += `  ... and ${Object.keys(stats.cellBreakdown).length - 10} more cell types\n`;
      }
    }
  }

  // Extract final statistics from stdout if available
  let finalStats = "";
  if (result.stdout) {
    const extracted = extractFinalStats(result.stdout);
    if (extracted) {
      finalStats = "\n=== YOSYS FINAL STATISTICS ===\n" + extracted;
    }
  }

  return JSON.stringify({
    project_id: result.projectId,
    run_id: result.runId,
    success: result.success,
    target: result.target,
    host_path: result.hostPath,
    container_path: result.containerPath,
    statistics: result.statistics,
    summary: summary || undefined,
    final_statistics: finalStats || undefined,
    synthesized_verilog_preview: result.synthesizedVerilog ?
      (result.synthesizedVerilog.length > 500 ?
        result.synthesizedVerilog.substring(0, 500) + "...(truncated, full output in synth_output.v)" :
        result.synthesizedVerilog) :
      undefined,
    log_excerpt: result.stdout ?
      (result.stdout.length > 2000 ?
        "...(log truncated, showing last 2000 chars)...\n" + result.stdout.substring(result.stdout.length - 2000) :
        result.stdout) :
      undefined,
    stderr: result.stderr || undefined,
    error: result.error,
    note: result.success ?
      `Synthesis completed successfully. Use project_id '${result.projectId}' for subsequent operations (simulation, OpenLane flow, etc.)` :
      "Synthesis failed. Check the error message for details."
  }, null, 2);
}
