/**
 * Docker Commands - High-level wrappers for EDA tool execution
 *
 * Provides typed interfaces for running Yosys, iverilog, OpenLane, etc.
 * inside the Docker container.
 */

import { dockerManager, DockerExecResult } from "./docker-manager.js";

/**
 * Run Yosys synthesis
 */
export async function runYosys(
  scriptContent: string,
  workdir: string
): Promise<DockerExecResult> {
  // Write script to a temporary file and run it
  const scriptPath = `${workdir}/synth.ys`;

  // Create script file
  const writeResult = await dockerManager.exec(
    `cat > ${scriptPath} << 'YOSYS_SCRIPT'\n${scriptContent}\nYOSYS_SCRIPT`,
    { workdir }
  );

  if (!writeResult.success) {
    return writeResult;
  }

  // Run Yosys
  return dockerManager.exec(
    `yosys -s ${scriptPath}`,
    { workdir, timeout: 120000 }
  );
}

/**
 * Run Yosys with inline commands
 */
export async function runYosysCommand(
  command: string,
  workdir: string
): Promise<DockerExecResult> {
  return dockerManager.exec(
    `yosys -p "${command.replace(/"/g, '\\"')}"`,
    { workdir, timeout: 120000 }
  );
}

/**
 * Compile Verilog with Icarus Verilog
 */
export async function compileVerilog(
  files: string[],
  outputName: string,
  workdir: string
): Promise<DockerExecResult> {
  const fileList = files.join(" ");
  return dockerManager.exec(
    `iverilog -o ${outputName} ${fileList}`,
    { workdir, timeout: 60000 }
  );
}

/**
 * Run VVP simulation
 */
export async function runSimulation(
  binaryPath: string,
  workdir: string
): Promise<DockerExecResult> {
  // Set LD_LIBRARY_PATH for libvvp.so shared library
  return dockerManager.exec(
    `LD_LIBRARY_PATH=/foss/tools/iverilog/lib:$LD_LIBRARY_PATH vvp ${binaryPath}`,
    { workdir, timeout: 120000 }
  );
}

/**
 * Compile and run simulation in one step
 */
export async function compileAndSimulate(
  designFiles: string[],
  testbenchFile: string,
  workdir: string
): Promise<{
  compile: DockerExecResult;
  simulate?: DockerExecResult;
}> {
  const allFiles = [...designFiles, testbenchFile];
  const binaryPath = "./simulation";

  // Compile
  const compileResult = await compileVerilog(allFiles, binaryPath, workdir);

  if (!compileResult.success) {
    return { compile: compileResult };
  }

  // Simulate
  const simulateResult = await runSimulation(binaryPath, workdir);

  return {
    compile: compileResult,
    simulate: simulateResult
  };
}

/**
 * OpenLane configuration interface
 */
export interface OpenLaneConfig {
  designName: string;
  verilogFiles: string[];
  clockPort?: string;
  clockPeriod?: number;
  dieArea?: string;
  coreUtil?: number;
  targetDensity?: number;
  synthStrategy?: string;
  // Additional config options
  extraConfig?: Record<string, any>;
}

/**
 * Create OpenLane config.json
 */
export function createOpenLaneConfig(config: OpenLaneConfig): string {
  const baseConfig: Record<string, any> = {
    DESIGN_NAME: config.designName,
    VERILOG_FILES: config.verilogFiles,
    CLOCK_PORT: config.clockPort || "clk",
    CLOCK_PERIOD: config.clockPeriod || 10.0,

    // Floorplanning
    FP_SIZING: "absolute",
    DIE_AREA: config.dieArea || "0 0 100 100",
    FP_CORE_UTIL: config.coreUtil || 50,

    // Placement
    PL_TARGET_DENSITY: config.targetDensity || 0.5,

    // Synthesis
    SYNTH_STRATEGY: config.synthStrategy || "AREA 0",

    // Disable strict checks for easier runs
    FP_PDN_MULTILAYER: false,
    QUIT_ON_TIMING_VIOLATIONS: false,
    QUIT_ON_MAGIC_DRC: false,
    QUIT_ON_LVS_ERROR: false,
    RUN_KLAYOUT_XOR: false,
    RUN_KLAYOUT_DRC: false
  };

  // Merge extra config
  if (config.extraConfig) {
    Object.assign(baseConfig, config.extraConfig);
  }

  return JSON.stringify(baseConfig, null, 2);
}

/**
 * Run OpenLane flow
 */
export async function runOpenLane(
  configPath: string,
  workdir: string,
  onProgress?: (message: string) => void
): Promise<DockerExecResult> {
  const command = `python3 -m openlane ${configPath}`;

  return dockerManager.execLong(command, {
    workdir,
    timeout: 600000, // 10 minutes
    onOutput: onProgress
  });
}

/**
 * Run OpenLane with dockerized mode (for nested Docker)
 */
export async function runOpenLaneDockerized(
  configPath: string,
  workdir: string,
  onProgress?: (message: string) => void
): Promise<DockerExecResult> {
  // Note: This is for when OpenLane itself needs to spawn Docker containers
  // In our setup, we're already inside Docker, so we use the direct mode
  const command = `python3 -m openlane ${configPath}`;

  return dockerManager.execLong(command, {
    workdir,
    timeout: 600000,
    onOutput: onProgress
  });
}

/**
 * Find GDS file in OpenLane run directory
 */
export async function findGDSFile(runDir: string): Promise<string | null> {
  const result = await dockerManager.exec(
    `find ${runDir}/final/gds -name "*.gds" 2>/dev/null | head -1`,
    { workdir: runDir }
  );

  if (result.success && result.stdout.trim()) {
    return result.stdout.trim();
  }

  return null;
}

/**
 * Read OpenLane report file
 */
export async function readReport(
  reportPath: string
): Promise<string | null> {
  const result = await dockerManager.exec(`cat ${reportPath}`);

  if (result.success) {
    return result.stdout;
  }

  return null;
}

/**
 * List files in a directory
 */
export async function listFiles(
  dirPath: string,
  pattern?: string
): Promise<string[]> {
  const findCmd = pattern
    ? `find ${dirPath} -name "${pattern}" -type f`
    : `find ${dirPath} -type f`;

  const result = await dockerManager.exec(findCmd);

  if (result.success) {
    return result.stdout.trim().split("\n").filter(Boolean);
  }

  return [];
}

/**
 * Check if file exists in container
 */
export async function fileExists(filePath: string): Promise<boolean> {
  const result = await dockerManager.exec(`test -f ${filePath} && echo "yes"`);
  return result.success && result.stdout.includes("yes");
}

/**
 * Create directory in container
 */
export async function createDirectory(dirPath: string): Promise<boolean> {
  const result = await dockerManager.exec(`mkdir -p ${dirPath}`);
  return result.success;
}

/**
 * Write content to file in container
 */
export async function writeFile(
  filePath: string,
  content: string
): Promise<boolean> {
  // Escape content for shell
  const escapedContent = content
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\"'\"'");

  const result = await dockerManager.exec(
    `cat > ${filePath} << 'EOF'\n${content}\nEOF`
  );

  return result.success;
}

/**
 * Read file content from container
 */
export async function readFile(filePath: string): Promise<string | null> {
  const result = await dockerManager.exec(`cat ${filePath}`);
  return result.success ? result.stdout : null;
}
