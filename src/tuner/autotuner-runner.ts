/**
 * AutoTuner Runner
 *
 * Executes OpenROAD ORFS AutoTuner within the Docker container.
 * Sets up proper ORFS directory structure and runs AutoTuner.
 *
 * ORFS AutoTuner CLI:
 *   python3 -m autotuner.distributed \
 *     --design <name> \
 *     --platform <platform> \
 *     --config <config.json> \
 *     tune --samples <n> --algorithm <algo>
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, access, mkdir } from "fs/promises";
import { join } from "path";
import type { AutoTunerConfig } from "./config-generator.js";
import { configToJson, validateConfig } from "./config-generator.js";
import { type ExtendedPPAMetrics } from "./metrics-extractor.js";
import {
  setupORFSDesign,
  cleanupORFSDesign,
  getORFSPlatform,
  type ORFSDesignConfig,
} from "./orfs-setup.js";

const execAsync = promisify(exec);

/**
 * AutoTuner run configuration
 */
export interface AutoTunerRunConfig {
  projectDir: string;
  designName: string;
  platform: string;
  verilogCode: string;
  clockPort: string;
  clockPeriod: number;
  config: AutoTunerConfig;
  timeout?: number; // in minutes
  containerName?: string;
  // User-defined ORFS config and SDC (optional)
  userConfigMk?: string;   // User-defined config.mk content (replaces auto-generated)
  userSdcContent?: string; // User-defined SDC content (replaces auto-generated)
}

/**
 * Single trial result
 */
export interface TrialResult {
  trialId: number;
  parameters: Record<string, number>;
  metrics: ExtendedPPAMetrics;
  score: number;
  status: "success" | "failed" | "timeout";
  duration: number; // seconds
}

/**
 * AutoTuner run result
 */
export interface AutoTunerResult {
  status: "completed" | "failed" | "stopped";
  totalTrials: number;
  successfulTrials: number;
  bestTrial?: TrialResult;
  bestParameters?: Record<string, number>;
  allTrials: TrialResult[];
  improvement?: {
    areaPercent: number;
    powerPercent: number;
    frequencyPercent: number;
    overall: number;
  };
  duration: number; // total seconds
  errorMessage?: string;
  orfsDesignDir?: string;
  logFile?: string;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: {
  currentTrial: number;
  totalTrials: number;
  bestScore: number;
  currentStatus: string;
}) => void;

/**
 * Check if ORFS AutoTuner is available in the container
 */
export async function checkAutoTunerAvailable(
  containerName: string = "mcp4eda"
): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    // Check for autotuner Python module
    const { stdout: moduleCheck } = await execAsync(
      `docker exec ${containerName} python3 -c "import autotuner; print('available')" 2>&1`,
      { timeout: 15000 }
    );

    if (moduleCheck.includes("available")) {
      // Module is available - try to get version info but don't fail if it errors
      let version = "ORFS AutoTuner";
      try {
        const { stdout: helpOutput } = await execAsync(
          `docker exec ${containerName} bash -c "python3 -m autotuner.distributed --help 2>&1 | head -3"`,
          { timeout: 15000 }
        );
        // Version info extracted if needed
      } catch {
        // Ignore help command errors - module is still available
      }

      return {
        available: true,
        version,
      };
    }

    // Check if ORFS is cloned but module not installed
    const { stdout: orfsCheck } = await execAsync(
      `docker exec ${containerName} bash -c "ls /foss/tools/OpenROAD-flow-scripts/tools/AutoTuner/setup.py 2>/dev/null && echo found"`,
      { timeout: 10000 }
    );

    if (orfsCheck.includes("found")) {
      return {
        available: false,
        error: "AutoTuner source found but not installed. Run: cd /foss/tools/OpenROAD-flow-scripts/tools/AutoTuner && pip3 install -e .",
      };
    }

    return {
      available: false,
      error: "ORFS AutoTuner not found. Rebuild Docker image with AutoTuner support.",
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Unknown error checking AutoTuner",
    };
  }
}

/**
 * Prepare AutoTuner configuration files in ORFS format
 */
export async function prepareAutoTunerRun(
  config: AutoTunerRunConfig
): Promise<{ configPath: string; workDir: string; orfsDesignDir: string }> {
  const { projectDir, designName, config: tunerConfig } = config;

  // Validate config
  const validation = validateConfig(tunerConfig);
  if (!validation.valid) {
    throw new Error(`Invalid config: ${validation.errors.join(", ")}`);
  }

  // Create autotuner work directory in project
  const workDir = join(projectDir, "autotuner");
  try {
    await mkdir(workDir, { recursive: true });
    await mkdir(join(workDir, "results"), { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Determine SDC content: user-provided > project existing > auto-generate
  let existingSdcContent: string | undefined;
  if (config.userSdcContent) {
    existingSdcContent = config.userSdcContent;
    console.error("Using user-defined SDC content for ORFS");
  } else {
    // Try to read existing constraint.sdc from project (generated by LibreLane)
    // SDC is stored at project root (next to config.json)
    try {
      const sdcPath = join(projectDir, "constraint.sdc");
      existingSdcContent = await readFile(sdcPath, "utf-8");
      console.error(`Using existing constraint.sdc from project: ${sdcPath}`);
    } catch {
      // No existing SDC, will be auto-generated by setupORFSDesign
      console.error("No existing constraint.sdc found, will generate one");
    }
  }

  // Determine config.mk content: user-provided > auto-generate
  let existingConfigMkContent: string | undefined;
  if (config.userConfigMk) {
    existingConfigMkContent = config.userConfigMk;
    console.error("Using user-defined config.mk content for ORFS");
  }

  // Setup ORFS design structure
  const orfsConfig: ORFSDesignConfig = {
    designName: config.designName,
    platform: config.platform,
    verilogCode: config.verilogCode,
    clockPort: config.clockPort,
    clockPeriod: config.clockPeriod,
    coreUtilization: tunerConfig.parameters.FP_CORE_UTIL?.min || 40,
    existingSdcContent,  // Pass existing SDC if found or user-provided
    existingConfigMkContent,  // Pass user-provided config.mk if any
  };

  const orfsSetup = await setupORFSDesign(orfsConfig);
  if (!orfsSetup.success) {
    throw new Error(`Failed to setup ORFS design: ${orfsSetup.error}`);
  }

  // Write ORFS-compatible AutoTuner config (parameters only)
  const configPath = join(workDir, "autotuner_config.json");
  const orfsConfig2 = generateORFSAutoTunerConfig(tunerConfig);
  await writeFile(configPath, JSON.stringify(orfsConfig2, null, 2), "utf-8");

  return { configPath, workDir, orfsDesignDir: orfsSetup.designDir };
}

/**
 * ORFS parameter name mapping (same as in config-generator.ts)
 *
 * ORFS AutoTuner has specific naming conventions:
 * - Some parameters need underscore prefix (e.g., _SDC_CLK_PERIOD)
 * - Some parameters don't need prefix (e.g., CORE_UTILIZATION, PLACE_DENSITY_LB_ADDON)
 */
const ORFS_PARAMETER_NAMES: Record<string, string> = {
  // Parameters that need underscore prefix (SDC/timing related)
  "CLOCK_PERIOD": "_SDC_CLK_PERIOD",
  "SDC_CLK_PERIOD": "_SDC_CLK_PERIOD",

  // Parameters that don't need prefix (ORFS Makefile variables)
  "CORE_UTILIZATION": "CORE_UTILIZATION",
  "FP_CORE_UTIL": "CORE_UTILIZATION",
  "PLACE_DENSITY_LB_ADDON": "PLACE_DENSITY_LB_ADDON",
  "PL_TARGET_DENSITY": "PLACE_DENSITY_LB_ADDON",
  "CTS_CLUSTER_SIZE": "CTS_CLUSTER_SIZE",
  "CTS_SINK_CLUSTERING_SIZE": "CTS_CLUSTER_SIZE",
  "CTS_CLUSTER_DIAMETER": "CTS_CLUSTER_DIAMETER",
  "CTS_SINK_CLUSTERING_MAX_DIAMETER": "CTS_CLUSTER_DIAMETER",
  "GPL_TIMING_DRIVEN": "GPL_TIMING_DRIVEN",
  "GPL_ROUTABILITY_DRIVEN": "GPL_ROUTABILITY_DRIVEN",
  "GRT_ALLOW_CONGESTION": "GRT_ALLOW_CONGESTION",
  // NOTE: GRT_OVERFLOW_ITERS is NOT tunable - will cause TUN-0017 error
  "DETAILED_ROUTE_END_ITERATION": "DETAILED_ROUTE_END_ITERATION",

  // Synthesis parameters
  "SYNTH_STRATEGY": "SYNTH_STRATEGY",
  "ABC_AREA": "ABC_AREA",

  // Aspect ratio
  "FP_ASPECT_RATIO": "FP_ASPECT_RATIO",
  "ASPECT_RATIO": "ASPECT_RATIO",
};

/**
 * List of parameters that are NOT tunable in ORFS AutoTuner
 * These will cause [ERROR TUN-0017] if included
 */
const NON_TUNABLE_PARAMETERS = [
  "GRT_OVERFLOW_ITERS",
  "coeff_perform",
  "coeff_power",
  "coeff_area",
];

/**
 * Generate ORFS-compatible AutoTuner config
 * Format: { "PARAM_NAME": { "type": "float|int", "minmax": [min, max], "step": 0 } }
 *
 * Note: Does NOT include coeff_* parameters - ORFS rejects those with TUN-0017 error.
 * IMPORTANT: When _SDC_CLK_PERIOD is used, we must provide _SDC_FILE_PATH
 */
function generateORFSAutoTunerConfig(config: AutoTunerConfig, sdcFilePath: string = "constraint.sdc"): Record<string, unknown> {
  const orfsConfig: Record<string, unknown> = {};
  let hasClockPeriod = false;

  for (const [name, range] of Object.entries(config.parameters)) {
    // Skip non-tunable parameters
    if (NON_TUNABLE_PARAMETERS.includes(name)) {
      continue;
    }

    // Determine type based on step value
    const isInt = Number.isInteger(range.min) && Number.isInteger(range.max) && range.step >= 1;

    // Map parameter name to ORFS format
    const orfsName = ORFS_PARAMETER_NAMES[name] || name;

    // Skip if the mapped name is non-tunable
    if (NON_TUNABLE_PARAMETERS.includes(orfsName)) {
      continue;
    }

    // Check if this is a clock period parameter
    if (orfsName === "_SDC_CLK_PERIOD") {
      hasClockPeriod = true;
    }

    orfsConfig[orfsName] = {
      type: isInt ? "int" : "float",
      minmax: [range.min, range.max],
      step: range.step > 0 ? range.step : 0,  // ORFS uses step=0 for continuous
    };
  }

  // IMPORTANT: If _SDC_CLK_PERIOD is used, we MUST provide _SDC_FILE_PATH
  // Otherwise ORFS AutoTuner will fail with:
  // [ERROR TUN-0020] No SDC reference file provided.
  if (hasClockPeriod) {
    return {
      "_SDC_FILE_PATH": sdcFilePath,
      ...orfsConfig
    };
  }

  return orfsConfig;
}

/**
 * Run ORFS AutoTuner
 */
export async function runAutoTuner(
  config: AutoTunerRunConfig,
  onProgress?: ProgressCallback
): Promise<AutoTunerResult> {
  const startTime = Date.now();
  const containerName = config.containerName || "mcp4eda";
  const allTrials: TrialResult[] = [];

  try {
    // Check AutoTuner availability
    const available = await checkAutoTunerAvailable(containerName);
    if (!available.available) {
      return {
        status: "failed",
        totalTrials: 0,
        successfulTrials: 0,
        allTrials: [],
        duration: 0,
        errorMessage: available.error || "AutoTuner not available",
      };
    }

    // Prepare configuration and ORFS structure
    const { configPath, workDir, orfsDesignDir } = await prepareAutoTunerRun(config);

    // Convert host paths to container paths
    const containerConfigPath = `/workspace/projects/${config.projectDir.split(/[/\\]/).pop()}/autotuner/autotuner_config.json`;
    const containerLogPath = `/workspace/projects/${config.projectDir.split(/[/\\]/).pop()}/autotuner/autotuner.log`;

    const platform = getORFSPlatform(config.platform);
    const algorithm = config.config.algorithm || "hyperopt";
    const samples = config.config.iterations;
    const jobs = config.config.parallelTrials || 2;

    // Report progress start
    if (onProgress) {
      onProgress({
        currentTrial: 0,
        totalTrials: samples,
        bestScore: 0,
        currentStatus: "Setting up ORFS AutoTuner...",
      });
    }

    // Build the AutoTuner command
    // ORFS AutoTuner expects to be run from ORFS directory
    // First create the autotuner directory inside the container
    const containerAutotunerDir = containerLogPath.replace(/\/[^/]+$/, "");
    const command = `mkdir -p ${containerAutotunerDir} && ` +
      `cd /foss/tools/OpenROAD-flow-scripts && ` +
      `python3 -m autotuner.distributed ` +
      `--design ${config.designName} ` +
      `--platform ${platform} ` +
      `--config ${containerConfigPath} ` +
      `--jobs ${jobs} ` +
      `tune ` +
      `--samples ${samples} ` +
      `--algorithm ${algorithm} ` +
      `2>&1 | tee ${containerLogPath}`;

    // Set timeout
    const timeoutMs = (config.timeout || 60) * 60 * 1000;

    if (onProgress) {
      onProgress({
        currentTrial: 0,
        totalTrials: samples,
        bestScore: 0,
        currentStatus: `Running AutoTuner with ${algorithm} algorithm (${samples} iterations)...`,
      });
    }

    // Execute AutoTuner
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "${command}"`,
      { timeout: timeoutMs, maxBuffer: 100 * 1024 * 1024 }
    );

    // Parse results from output
    const result = parseAutoTunerOutput(stdout, stderr, startTime, samples);
    result.orfsDesignDir = orfsDesignDir;
    result.logFile = containerLogPath;

    // Save results to file
    const resultsPath = join(workDir, "results", "results.json");
    await writeFile(resultsPath, JSON.stringify(result, null, 2), "utf-8");

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Check if it's a timeout
    if (errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
      return {
        status: "stopped",
        totalTrials: allTrials.length,
        successfulTrials: allTrials.filter((t) => t.status === "success").length,
        allTrials,
        duration: (Date.now() - startTime) / 1000,
        errorMessage: "AutoTuner timed out",
      };
    }

    return {
      status: "failed",
      totalTrials: allTrials.length,
      successfulTrials: 0,
      allTrials,
      duration: (Date.now() - startTime) / 1000,
      errorMessage: errorMsg,
    };
  }
}

/**
 * Parse AutoTuner output from stdout/stderr
 */
function parseAutoTunerOutput(
  stdout: string,
  stderr: string,
  startTime: number,
  expectedTrials: number
): AutoTunerResult {
  const allTrials: TrialResult[] = [];

  // Look for trial results in output
  // ORFS AutoTuner outputs: "Trial X finished with score: Y"
  const trialRegex = /Trial[:\s]+(\d+).*?(?:score|Score)[:\s]+([\d.e+-]+)/gi;
  let match;
  while ((match = trialRegex.exec(stdout)) !== null) {
    const trialId = parseInt(match[1]);
    const score = parseFloat(match[2]);

    // Try to extract parameters for this trial
    const params = extractTrialParameters(stdout, trialId);

    allTrials.push({
      trialId,
      parameters: params,
      metrics: { id: trialId, runId: "" },
      score: isNaN(score) ? 0 : score,
      status: "success",
      duration: 0,
    });
  }

  // Look for best result line
  const bestMatch = stdout.match(/[Bb]est.*?[Ss]core[:\s]+([\d.e+-]+)/);
  const bestParamsMatch = stdout.match(/[Bb]est.*?[Pp]arameters[:\s]+(\{[^}]+\})/);

  let bestParameters: Record<string, number> | undefined;
  if (bestParamsMatch) {
    try {
      bestParameters = JSON.parse(bestParamsMatch[1]);
    } catch {
      // Parsing failed, try to extract manually
    }
  }

  // If no trials parsed, check if completed
  const hasCompleted = stdout.includes("completed") ||
    stdout.includes("Finished") ||
    stdout.includes("Best");

  // Find best trial from parsed results
  const successfulTrials = allTrials.filter((t) => t.status === "success");
  const bestTrial = successfulTrials.length > 0
    ? successfulTrials.sort((a, b) => b.score - a.score)[0]
    : undefined;

  // Check for errors
  const hasError =
    stderr.toLowerCase().includes("error") ||
    stdout.toLowerCase().includes("failed") ||
    stdout.toLowerCase().includes("exception");

  // Calculate improvements if baseline exists
  let improvement: AutoTunerResult["improvement"];
  const baselineMatch = stdout.match(/[Bb]aseline.*?[Ss]core[:\s]+([\d.e+-]+)/);
  if (baselineMatch && bestTrial) {
    const baseline = parseFloat(baselineMatch[1]);
    if (!isNaN(baseline) && baseline > 0) {
      const improvementPct = ((bestTrial.score - baseline) / baseline) * 100;
      improvement = {
        areaPercent: 0, // Would need to parse from metrics
        powerPercent: 0,
        frequencyPercent: 0,
        overall: improvementPct,
      };
    }
  }

  return {
    status: hasError && successfulTrials.length === 0 ? "failed" : "completed",
    totalTrials: allTrials.length || expectedTrials,
    successfulTrials: successfulTrials.length,
    bestTrial,
    bestParameters: bestParameters || bestTrial?.parameters,
    allTrials,
    improvement,
    duration: (Date.now() - startTime) / 1000,
    errorMessage: hasError && successfulTrials.length === 0
      ? stderr || "Error during AutoTuner execution"
      : undefined,
  };
}

/**
 * Extract parameters for a specific trial from output
 */
function extractTrialParameters(stdout: string, trialId: number): Record<string, number> {
  const params: Record<string, number> = {};

  // Look for parameter lines near trial output
  const trialSection = stdout.substring(
    Math.max(0, stdout.indexOf(`Trial ${trialId}`) - 200),
    stdout.indexOf(`Trial ${trialId + 1}`) > 0
      ? stdout.indexOf(`Trial ${trialId + 1}`)
      : stdout.length
  );

  // Common parameter patterns
  const paramPatterns = [
    /FP_CORE_UTIL[:\s=]+([\d.]+)/i,
    /PL_TARGET_DENSITY[:\s=]+([\d.]+)/i,
    /CTS_CLK_BUFFER_LIST[:\s=]+([^\s,]+)/i,
    /CELL_PAD_IN_SITES_GLOBAL_PLACEMENT[:\s=]+([\d]+)/i,
  ];

  for (const pattern of paramPatterns) {
    const match = trialSection.match(pattern);
    if (match) {
      const paramName = pattern.source.split(/[:\s=]/)[0];
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        params[paramName] = value;
      }
    }
  }

  return params;
}

/**
 * Stop a running AutoTuner process
 */
export async function stopAutoTuner(
  containerName: string = "mcp4eda"
): Promise<boolean> {
  try {
    // Kill python autotuner processes
    await execAsync(
      `docker exec ${containerName} pkill -f "autotuner.distributed"`,
      { timeout: 10000 }
    );

    // Also kill any Ray processes
    await execAsync(
      `docker exec ${containerName} pkill -f "ray"`,
      { timeout: 10000 }
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Get AutoTuner run status
 */
export async function getAutoTunerStatus(
  projectDir: string
): Promise<{
  running: boolean;
  progress?: number;
  currentTrial?: number;
  bestScore?: number;
}> {
  try {
    // Check if autotuner process is running
    const { stdout } = await execAsync(
      `docker exec mcp4eda bash -c "pgrep -f 'autotuner.distributed' 2>/dev/null || echo ''"`,
      { timeout: 5000 }
    );

    const running = stdout.trim().length > 0;

    // Try to read status from log file
    if (running) {
      const statusPath = join(projectDir, "autotuner", "autotuner.log");
      try {
        await access(statusPath);
        const content = await readFile(statusPath, "utf-8");

        // Parse last trial number
        const trialMatches = content.match(/Trial[:\s]+(\d+)/gi);
        const currentTrial = trialMatches
          ? parseInt(trialMatches[trialMatches.length - 1].match(/\d+/)?.[0] || "0")
          : undefined;

        // Parse best score so far
        const scoreMatches = content.match(/[Bb]est.*?[Ss]core[:\s]+([\d.e+-]+)/g);
        const bestScore = scoreMatches
          ? parseFloat(scoreMatches[scoreMatches.length - 1].match(/([\d.e+-]+)/)?.[1] || "0")
          : undefined;

        return { running, currentTrial, bestScore };
      } catch {
        return { running };
      }
    }

    return { running: false };
  } catch {
    return { running: false };
  }
}

/**
 * Cleanup ORFS design after AutoTuner run
 */
export async function cleanupAutoTunerDesign(
  designName: string,
  platform: string
): Promise<boolean> {
  return cleanupORFSDesign(designName, platform);
}

/**
 * Format AutoTuner results for display
 */
export function formatAutoTunerResult(result: AutoTunerResult): string {
  const lines: string[] = [];

  lines.push("=== ORFS AutoTuner Results ===");
  lines.push("");
  lines.push(`Status: ${result.status.toUpperCase()}`);
  lines.push(`Duration: ${(result.duration / 60).toFixed(1)} minutes`);
  lines.push(`Trials: ${result.successfulTrials}/${result.totalTrials} successful`);
  lines.push("");

  if (result.bestTrial) {
    lines.push("Best Configuration Found:");
    lines.push(`  Score: ${result.bestTrial.score.toFixed(4)}`);

    if (Object.keys(result.bestTrial.parameters).length > 0) {
      lines.push("  Parameters:");
      for (const [name, value] of Object.entries(result.bestTrial.parameters)) {
        lines.push(`    ${name}: ${typeof value === "number" ? value.toFixed(3) : value}`);
      }
    }
    lines.push("");
  }

  if (result.bestParameters && !result.bestTrial) {
    lines.push("Best Parameters:");
    for (const [name, value] of Object.entries(result.bestParameters)) {
      lines.push(`  ${name}: ${typeof value === "number" ? value.toFixed(3) : value}`);
    }
    lines.push("");
  }

  if (result.improvement) {
    lines.push("Improvement over baseline:");
    if (result.improvement.areaPercent !== 0) {
      lines.push(`  Area: ${result.improvement.areaPercent > 0 ? "+" : ""}${result.improvement.areaPercent.toFixed(1)}%`);
    }
    if (result.improvement.powerPercent !== 0) {
      lines.push(`  Power: ${result.improvement.powerPercent > 0 ? "+" : ""}${result.improvement.powerPercent.toFixed(1)}%`);
    }
    if (result.improvement.frequencyPercent !== 0) {
      lines.push(`  Frequency: ${result.improvement.frequencyPercent > 0 ? "+" : ""}${result.improvement.frequencyPercent.toFixed(1)}%`);
    }
    lines.push(`  Overall Score: ${result.improvement.overall > 0 ? "+" : ""}${result.improvement.overall.toFixed(1)}%`);
    lines.push("");
  }

  if (result.orfsDesignDir) {
    lines.push(`ORFS Design Directory: ${result.orfsDesignDir}`);
  }

  if (result.logFile) {
    lines.push(`Log File: ${result.logFile}`);
  }

  if (result.errorMessage) {
    lines.push("");
    lines.push(`Error: ${result.errorMessage}`);
  }

  return lines.join("\n");
}
