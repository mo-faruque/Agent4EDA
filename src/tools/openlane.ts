/**
 * OpenLane Tool - Refactored for Docker execution
 *
 * Runs complete ASIC design flow (RTL to GDSII) using OpenLane in Docker
 */

import { dockerManager } from "../docker/docker-manager.js";
import { projectManager } from "../files/project-manager.js";
import { pathResolver } from "../files/path-resolver.js";
import { fileManager } from "../files/file-manager.js";

/**
 * OpenLane result interface
 */
/**
 * Comprehensive signoff metrics for tapeout readiness
 */
export interface SignoffMetrics {
  // Area metrics
  areaUm2?: number;           // Die area in um²
  coreAreaUm2?: number;       // Core area in um²
  utilization?: number;       // Core utilization (0-1)
  cellCount?: number;         // Total cell count

  // Timing metrics (worst across all corners)
  setupWns?: number;          // Setup Worst Negative Slack (ns) - must be >= 0
  setupTns?: number;          // Setup Total Negative Slack (ns) - must be >= 0
  holdWns?: number;           // Hold Worst Negative Slack (ns) - must be >= 0
  holdTns?: number;           // Hold Total Negative Slack (ns) - must be >= 0
  setupViolations?: number;   // Number of setup violations - must be 0
  holdViolations?: number;    // Number of hold violations - must be 0
  frequencyMhz?: number;      // Max achievable frequency

  // Power metrics
  totalPowerMw?: number;      // Total power (mW)
  leakagePowerMw?: number;    // Leakage power (mW)
  switchingPowerMw?: number;  // Switching/dynamic power (mW)
  internalPowerMw?: number;   // Internal power (mW)

  // DRC/LVS metrics (critical for tapeout)
  magicDrcErrors?: number;    // Magic DRC errors - must be 0
  klayoutDrcErrors?: number;  // KLayout DRC errors - must be 0
  lvsErrors?: number;         // LVS errors - must be 0
  antennaViolations?: number; // Antenna rule violations - must be 0

  // Routing metrics
  wirelength?: number;        // Total wirelength
  routingDrcErrors?: number;  // Post-routing DRC errors - must be 0

  // Physical verification
  xorDifference?: number;     // GDS XOR difference count - must be 0
  irDropWorst?: number;       // Worst IR drop (V)

  // Design rule checks
  slewViolations?: number;    // Max slew violations - must be 0
  capViolations?: number;     // Max capacitance violations - must be 0
  fanoutViolations?: number;  // Max fanout violations - must be 0
}

export interface OpenlaneResult {
  success: boolean;
  projectId: string;
  runId?: string;
  designName: string;
  hostPath?: string;
  containerPath?: string;
  latestRun?: string;
  gdsFile?: string;
  gdsPath?: string;
  stdout?: string;
  stderr?: string;
  ppaMetrics?: SignoffMetrics;  // Comprehensive signoff metrics
  signoffStatus?: {
    timingClean: boolean;       // No setup/hold violations
    drcClean: boolean;          // No DRC errors
    lvsClean: boolean;          // No LVS errors
    antennaClean: boolean;      // No antenna violations
    tapeoutReady: boolean;      // All checks pass
  };
  error?: string;
}

/**
 * OpenLane options
 */
export interface OpenlaneOptions {
  verilogCode?: string;        // Verilog code as string
  verilogFiles?: string[];     // OR: array of Verilog file paths (container paths supported)
  designName: string;
  clockPort?: string;
  clockPeriod?: number;
  pdk?: "sky130A" | "gf180mcuD" | "ihp-sg13g2";
  projectId?: string;
  projectName?: string;
  dieArea?: string;
  coreArea?: string;

  // User-defined config overrides (optional)
  userConfig?: Record<string, any>;  // User-defined LibreLane config (merged with generated)
  userConfigJson?: string;           // OR: User-defined config as JSON string
  userSdcContent?: string;           // User-defined SDC content (replaces auto-generated)
  userSdcFile?: string;              // OR: Path to user SDC file (container or host path)
}

/**
 * Run complete OpenLane ASIC flow
 */
export async function runOpenlane(options: OpenlaneOptions): Promise<OpenlaneResult> {
  const {
    verilogCode,
    verilogFiles,
    designName,
    clockPort = "clk",
    clockPeriod = 10.0,
    pdk = "sky130A",
  } = options;

  // Validate input - must have verilogCode, verilogFiles, or projectId
  if (!verilogCode && (!verilogFiles || verilogFiles.length === 0) && !options.projectId) {
    return {
      success: false,
      projectId: "",
      designName,
      error: "Either 'verilog_code', 'verilog_files', or 'project_id' must be provided",
    };
  }

  try {
    // Ensure Docker container is running
    if (!(await dockerManager.ensureRunning())) {
      return {
        success: false,
        projectId: "",
        designName,
        error: "Docker container is not running. Please start the container first.",
      };
    }

    // Create or get project
    let projectId = options.projectId;
    let hostPath: string;
    let containerPath: string;

    if (projectId) {
      const project = projectManager.getProject(projectId);
      if (!project) {
        return {
          success: false,
          projectId: projectId,
          designName,
          error: `Project ${projectId} not found`,
        };
      }
      const paths = projectManager.getProjectPaths(projectId);
      hostPath = paths.hostPath;
      containerPath = paths.containerPath;
    } else {
      const result = projectManager.createProject({
        name: options.projectName || `openlane_${designName}_${Date.now()}`,
        designName,
        topModule: designName,
      });
      projectId = result.project.id;
      hostPath = result.hostPath;
      containerPath = result.containerPath;
    }

    // Create a run for this OpenLane flow
    const run = projectManager.createRun({
      projectId,
      runType: "openlane",
      config: { designName, clockPort, clockPeriod, pdk },
    });
    projectManager.startRun(run.id);

    // Helper to check if a filename is a testbench (should be excluded from synthesis)
    const isTestbench = (filename: string): boolean => {
      const lower = filename.toLowerCase();
      return lower.includes('testbench') ||
             lower.includes('_tb.') ||
             lower.includes('_tb_') ||
             lower.endsWith('_tb.v') ||
             lower.endsWith('_tb.sv') ||
             lower.startsWith('tb_') ||
             lower === 'tb.v' ||
             lower === 'tb.sv';
    };

    // Track design files written (excluding testbenches)
    const designFiles: string[] = [];

    // Write the Verilog file(s)
    if (verilogCode && verilogCode !== "// Using files from synthesis project") {
      // Single code string provided
      const fileName = `${designName}.v`;
      projectManager.writeDesignFile(projectId, fileName, verilogCode, run.id);
      designFiles.push(fileName);
    } else if (verilogFiles && verilogFiles.length > 0) {
      // File paths provided - read and copy files (supports container paths)
      const path = await import("path");

      for (const filePath of verilogFiles) {
        try {
          let content: string;
          const fileName = path.basename(filePath);

          // Skip testbench files
          if (isTestbench(fileName)) {
            console.error(`Skipping testbench file: ${fileName}`);
            continue;
          }

          // Check if this is a container path - read from container
          if (pathResolver.isContainerPath(filePath)) {
            const catResult = await dockerManager.exec(`cat "${filePath}"`, { timeout: 10000 });
            if (!catResult.success) {
              projectManager.failRun(run.id, `Failed to read container file ${filePath}`);
              return {
                success: false,
                projectId,
                designName,
                error: `Failed to read container file ${filePath}: ${catResult.stderr}`,
              };
            }
            content = catResult.stdout;
          } else {
            // Read from host filesystem
            const fs = await import("fs");
            content = fs.readFileSync(filePath, "utf-8");
          }

          projectManager.writeDesignFile(projectId, fileName, content, run.id);
          designFiles.push(fileName);
        } catch (err: any) {
          projectManager.failRun(run.id, `Failed to read file ${filePath}`);
          return {
            success: false,
            projectId,
            designName,
            error: `Failed to read file ${filePath}: ${err.message}`,
          };
        }
      }
    }

    // If using existing project, scan src/ for design files (excluding testbenches)
    if (designFiles.length === 0 && options.projectId) {
      const listResult = await dockerManager.exec(`ls ${containerPath}/src/*.v ${containerPath}/src/*.sv 2>/dev/null | xargs -n1 basename`, {
        workdir: containerPath,
      });
      if (listResult.success && listResult.stdout.trim()) {
        for (const file of listResult.stdout.trim().split('\n')) {
          if (file && !isTestbench(file)) {
            designFiles.push(file);
          }
        }
      }
      // Fallback to design name if no files found
      if (designFiles.length === 0) {
        designFiles.push(`${designName}.v`);
      }
    }

    // Generate or use user-defined OpenLane config
    let config: Record<string, any>;
    if (options.userConfigJson) {
      // Parse user-provided JSON config
      try {
        config = JSON.parse(options.userConfigJson);
        console.error("Using user-defined config from JSON string");
      } catch (e) {
        return {
          success: false,
          projectId,
          designName,
          error: `Invalid userConfigJson: ${e instanceof Error ? e.message : "parse error"}`,
        };
      }
    } else if (options.userConfig) {
      // Use user-provided config object, merged with required fields
      config = {
        ...generateOpenlaneConfig({
          designName,
          clockPort,
          clockPeriod,
          pdk,
          dieArea: options.dieArea,
          coreArea: options.coreArea,
          verilogFiles: designFiles,
        }),
        ...options.userConfig, // User overrides take precedence
      };
      console.error("Using user-defined config (merged with defaults)");
    } else {
      // Auto-generate config with specific design files (excludes testbenches)
      config = generateOpenlaneConfig({
        designName,
        clockPort,
        clockPeriod,
        pdk,
        dieArea: options.dieArea,
        coreArea: options.coreArea,
        verilogFiles: designFiles,
      });
    }
    fileManager.writeFile(projectId, "config.json", JSON.stringify(config, null, 2), "config", run.id);

    // Generate or use user-defined constraint.sdc
    // This SDC can be reused by ORFS AutoTuner without regeneration
    let sdcContent: string;
    if (options.userSdcContent) {
      // Use user-provided SDC content directly
      sdcContent = options.userSdcContent;
      console.error("Using user-defined SDC content");
    } else if (options.userSdcFile) {
      // Read SDC from user-specified file (container or host path)
      try {
        // Try reading from container first
        const readResult = await dockerManager.exec(`cat "${options.userSdcFile}" 2>/dev/null`);
        if (readResult.success && readResult.stdout.trim()) {
          sdcContent = readResult.stdout;
          console.error(`Using user SDC file from container: ${options.userSdcFile}`);
        } else {
          // Try reading from host path via file manager
          const hostSdc = fileManager.readFileByPath(options.userSdcFile);
          if (hostSdc) {
            sdcContent = hostSdc;
            console.error(`Using user SDC file from host: ${options.userSdcFile}`);
          } else {
            return {
              success: false,
              projectId,
              designName,
              error: `Could not read user SDC file: ${options.userSdcFile}`,
            };
          }
        }
      } catch (e) {
        return {
          success: false,
          projectId,
          designName,
          error: `Error reading user SDC file: ${e instanceof Error ? e.message : "unknown error"}`,
        };
      }
    } else {
      // Auto-generate SDC
      sdcContent = generateProjectConstraintSdc({
        designName,
        clockPort,
        clockPeriod,
      });
    }
    fileManager.writeFile(projectId, "constraint.sdc", sdcContent, "constraint", run.id);

    // Run LibreLane (OpenLane 2) in Docker container (this can take a long time)
    // LibreLane is the successor to OpenLane and uses `librelane` command
    const openlaneCmd = `cd ${containerPath} && librelane --flow Classic config.json 2>&1`;

    console.error(`Starting LibreLane (OpenLane 2) flow for ${designName} in container...`);
    console.error(`This may take up to 10 minutes...`);

    const result = await dockerManager.execLong(openlaneCmd, {
      workdir: containerPath,
      timeout: 600000, // 10 minutes
      onOutput: (data) => {
        // Log progress to stderr (not visible to MCP but helps with debugging)
        if (data.includes("Step") || data.includes("Complete") || data.includes("Running")) {
          console.error(`LibreLane: ${data.trim()}`);
        }
      },
    });

    // Find the latest run directory and GDS file
    const { latestRun, gdsFile, gdsPath } = await findOpenlaneOutputs(projectId, containerPath);

    // Parse comprehensive signoff metrics from reports
    let ppaMetrics: SignoffMetrics | undefined;
    let signoffStatus: OpenlaneResult["signoffStatus"];
    if (result.success && latestRun) {
      const metricsResult = await parsePPAMetrics(containerPath, latestRun, clockPeriod);
      ppaMetrics = metricsResult.metrics;
      signoffStatus = metricsResult.signoffStatus;

      // Save PPA metrics to database (store key metrics for comparison)
      if (ppaMetrics && Object.keys(ppaMetrics).length > 0) {
        projectManager.savePPAMetrics(run.id, {
          areaUm2: ppaMetrics.areaUm2,
          powerMw: ppaMetrics.totalPowerMw,
          frequencyMhz: ppaMetrics.frequencyMhz,
          wnsNs: ppaMetrics.setupWns,
          tnsNs: ppaMetrics.setupTns,
          cellCount: ppaMetrics.cellCount,
        });
      }
    }

    // Update run status
    if (result.success) {
      projectManager.completeRun(run.id, {
        latestRun,
        gdsFile,
        ppaMetrics,
        signoffStatus,
      });
    } else {
      projectManager.failRun(run.id, result.stderr);
    }

    return {
      success: result.success,
      projectId,
      runId: run.id,
      designName,
      hostPath,
      containerPath,
      latestRun,
      gdsFile,
      gdsPath,
      stdout: result.stdout,
      stderr: result.stderr,
      ppaMetrics,
      signoffStatus,
      error: result.success ? undefined : result.stderr,
    };

  } catch (error: any) {
    return {
      success: false,
      projectId: options.projectId || "",
      designName,
      error: error.message || String(error),
    };
  }
}

/**
 * Generate SDC constraint file for the design
 * This creates a canonical constraint.sdc that can be used by both LibreLane and ORFS AutoTuner
 *
 * @param options - Design options including clock configuration
 * @returns SDC file content as string
 */
export function generateProjectConstraintSdc(options: {
  designName: string;
  clockPort: string;
  clockPeriod: number;
  ioDelayPercent?: number;  // Default 0.2 (20% of clock period)
}): string {
  const ioPct = options.ioDelayPercent ?? 0.2;

  return `# Auto-generated by MCP4EDA
# Timing constraints for ${options.designName}
# Can be used by both LibreLane and ORFS AutoTuner

current_design ${options.designName}

set clk_name core_clock
set clk_port_name ${options.clockPort}
set clk_period ${options.clockPeriod}
set clk_io_pct ${ioPct}

set clk_port [get_ports $clk_port_name]

create_clock -name $clk_name -period $clk_period $clk_port

set non_clock_inputs [all_inputs -no_clocks]

set_input_delay [expr $clk_period * $clk_io_pct] -clock $clk_name $non_clock_inputs
set_output_delay [expr $clk_period * $clk_io_pct] -clock $clk_name [all_outputs]
`;
}

/**
 * Generate LibreLane (OpenLane 2) configuration
 * Uses the new LibreLane JSON format with PDK-specific overrides
 */
function generateOpenlaneConfig(options: {
  designName: string;
  clockPort: string;
  clockPeriod: number;
  pdk: string;
  dieArea?: string;
  coreArea?: string;
  verilogFiles?: string[];  // Specific files to include (excludes testbenches)
}): Record<string, any> {
  // LibreLane config format - uses dir:: prefix for design directory paths
  // If specific files provided, use them; otherwise use glob but we'll filter testbenches
  let verilogFilesConfig: string | string[];
  if (options.verilogFiles && options.verilogFiles.length > 0) {
    // Use specific file paths with dir:: prefix
    verilogFilesConfig = options.verilogFiles.map(f => `dir::src/${f}`);
  } else {
    // Default to design file named after the design
    verilogFilesConfig = [`dir::src/${options.designName}.v`];
  }

  const config: Record<string, any> = {
    DESIGN_NAME: options.designName,
    VERILOG_FILES: verilogFilesConfig,
    CLOCK_PORT: options.clockPort,
    CLOCK_PERIOD: options.clockPeriod,

    // PDK configuration
    PDK: options.pdk,

    // Floorplanning - use relative sizing for auto-sizing
    FP_SIZING: "relative",
    FP_CORE_UTIL: 30,  // 30% core utilization - conservative for complex designs
    PL_TARGET_DENSITY_PCT: 40,

    // Skip checks that might fail for educational/prototype designs
    // Note: Using new LibreLane variable names (not deprecated QUIT_ON_* names)
    ERROR_ON_MAGIC_DRC: false,
    ERROR_ON_LVS_ERROR: false,
  };

  // If absolute sizing is specified, use it
  if (options.dieArea) {
    config.FP_SIZING = "absolute";
    config.DIE_AREA = options.dieArea;
    if (options.coreArea) {
      config.CORE_AREA = options.coreArea;
    }
    delete config.FP_CORE_UTIL;
    delete config.PL_TARGET_DENSITY_PCT;
  }

  // Clean up undefined values
  Object.keys(config).forEach(key => {
    if (config[key] === undefined) {
      delete config[key];
    }
  });

  return config;
}

/**
 * Find OpenLane outputs (latest run and GDS file)
 * LibreLane outputs GDS in numbered step directories like:
 * - 56-magic-streamout/<design>.gds (main GDS)
 * - 57-klayout-streamout/<design>.klayout.gds
 */
async function findOpenlaneOutputs(projectId: string, containerPath: string): Promise<{
  latestRun?: string;
  gdsFile?: string;
  gdsPath?: string;
}> {
  try {
    // List runs directory
    const listRunsCmd = `ls -t ${containerPath}/runs 2>/dev/null | head -1`;
    const runsResult = await dockerManager.exec(listRunsCmd, { workdir: containerPath });

    if (!runsResult.success || !runsResult.stdout.trim()) {
      return {};
    }

    const latestRun = runsResult.stdout.trim();

    // Find GDS file - check multiple possible locations
    // 1. LibreLane magic-streamout directory (preferred - main GDS output)
    // 2. LibreLane final directory
    // 3. OpenLane 1.x results directory
    const findGdsCmd = `find ${containerPath}/runs/${latestRun} -name "*.gds" ! -name "*.magic.gds" ! -name "*.klayout.gds" 2>/dev/null | head -1`;
    const gdsResult = await dockerManager.exec(findGdsCmd, { workdir: containerPath });

    let gdsFile: string | undefined;
    let gdsPath: string | undefined;

    if (gdsResult.success && gdsResult.stdout.trim()) {
      gdsPath = gdsResult.stdout.trim();
      gdsFile = gdsPath.split("/").pop();
    }

    return { latestRun, gdsFile, gdsPath };
  } catch {
    return {};
  }
}

/**
 * Parse comprehensive signoff metrics from LibreLane's final/metrics.json
 * Extracts all critical metrics needed for tapeout readiness assessment
 */
async function parsePPAMetrics(containerPath: string, latestRun: string, clockPeriod?: number): Promise<{
  metrics: SignoffMetrics;
  signoffStatus: OpenlaneResult["signoffStatus"];
}> {
  const metrics: SignoffMetrics = {};
  const signoffStatus = {
    timingClean: false,
    drcClean: false,
    lvsClean: false,
    antennaClean: false,
    tapeoutReady: false,
  };

  try {
    // Read metrics.json from final directory (LibreLane format)
    const metricsCmd = `cat ${containerPath}/runs/${latestRun}/final/metrics.json 2>/dev/null`;
    const metricsResult = await dockerManager.exec(metricsCmd, { workdir: containerPath });

    if (metricsResult.success && metricsResult.stdout.trim()) {
      try {
        const m = JSON.parse(metricsResult.stdout);

        // ===== AREA METRICS =====
        if (m["design__die__area"] !== undefined) {
          metrics.areaUm2 = m["design__die__area"];
        }
        if (m["design__core__area"] !== undefined) {
          metrics.coreAreaUm2 = m["design__core__area"];
        }
        if (m["design__instance__utilization"] !== undefined) {
          metrics.utilization = m["design__instance__utilization"];
        }
        if (m["design__instance__count"] !== undefined) {
          metrics.cellCount = m["design__instance__count"];
        }

        // ===== TIMING METRICS (worst across all corners) =====
        if (m["timing__setup__wns"] !== undefined) {
          metrics.setupWns = m["timing__setup__wns"];
        }
        if (m["timing__setup__tns"] !== undefined) {
          metrics.setupTns = m["timing__setup__tns"];
        }
        if (m["timing__hold__wns"] !== undefined) {
          metrics.holdWns = m["timing__hold__wns"];
        }
        if (m["timing__hold__tns"] !== undefined) {
          metrics.holdTns = m["timing__hold__tns"];
        }
        if (m["timing__setup_vio__count"] !== undefined) {
          metrics.setupViolations = m["timing__setup_vio__count"];
        }
        if (m["timing__hold_vio__count"] !== undefined) {
          metrics.holdViolations = m["timing__hold_vio__count"];
        }

        // Calculate max frequency from worst setup slack
        if (clockPeriod && m["timing__setup__ws"] !== undefined && m["timing__setup__ws"] !== Infinity) {
          const worstSlack = m["timing__setup__ws"];
          // Frequency = 1000 / (clock_period - slack) in MHz
          // If slack is positive, we can run faster than target
          const achievablePeriod = clockPeriod - worstSlack;
          if (achievablePeriod > 0) {
            metrics.frequencyMhz = 1000 / achievablePeriod;
          }
        }

        // ===== POWER METRICS =====
        if (m["power__total"] !== undefined) {
          metrics.totalPowerMw = m["power__total"] * 1000; // W to mW
        }
        if (m["power__leakage__total"] !== undefined) {
          metrics.leakagePowerMw = m["power__leakage__total"] * 1000;
        }
        if (m["power__switching__total"] !== undefined) {
          metrics.switchingPowerMw = m["power__switching__total"] * 1000;
        }
        if (m["power__internal__total"] !== undefined) {
          metrics.internalPowerMw = m["power__internal__total"] * 1000;
        }

        // ===== DRC/LVS METRICS (Critical for tapeout) =====
        if (m["magic__drc_error__count"] !== undefined) {
          metrics.magicDrcErrors = m["magic__drc_error__count"];
        }
        if (m["klayout__drc_error__count"] !== undefined) {
          metrics.klayoutDrcErrors = m["klayout__drc_error__count"];
        }
        if (m["design__lvs_error__count"] !== undefined) {
          metrics.lvsErrors = m["design__lvs_error__count"];
        }
        if (m["antenna__violating__pins"] !== undefined) {
          metrics.antennaViolations = m["antenna__violating__pins"];
        }

        // ===== ROUTING METRICS =====
        if (m["route__wirelength"] !== undefined) {
          metrics.wirelength = m["route__wirelength"];
        }
        if (m["route__drc_errors"] !== undefined) {
          metrics.routingDrcErrors = m["route__drc_errors"];
        }

        // ===== PHYSICAL VERIFICATION =====
        if (m["design__xor_difference__count"] !== undefined) {
          metrics.xorDifference = m["design__xor_difference__count"];
        }
        if (m["ir__drop__worst"] !== undefined) {
          metrics.irDropWorst = m["ir__drop__worst"];
        }

        // ===== DESIGN RULE CHECKS =====
        if (m["design__max_slew_violation__count"] !== undefined) {
          metrics.slewViolations = m["design__max_slew_violation__count"];
        }
        if (m["design__max_cap_violation__count"] !== undefined) {
          metrics.capViolations = m["design__max_cap_violation__count"];
        }
        if (m["design__max_fanout_violation__count"] !== undefined) {
          metrics.fanoutViolations = m["design__max_fanout_violation__count"];
        }

        // ===== DETERMINE SIGNOFF STATUS =====
        // Timing is clean if no violations and WNS >= 0
        signoffStatus.timingClean =
          (metrics.setupViolations ?? 0) === 0 &&
          (metrics.holdViolations ?? 0) === 0 &&
          (metrics.setupWns ?? 0) >= 0 &&
          (metrics.holdWns ?? 0) >= 0;

        // DRC is clean if no errors from Magic, KLayout, or routing
        signoffStatus.drcClean =
          (metrics.magicDrcErrors ?? 0) === 0 &&
          (metrics.klayoutDrcErrors ?? 0) === 0 &&
          (metrics.routingDrcErrors ?? 0) === 0 &&
          (metrics.slewViolations ?? 0) === 0 &&
          (metrics.capViolations ?? 0) === 0 &&
          (metrics.fanoutViolations ?? 0) === 0;

        // LVS is clean if no LVS errors
        signoffStatus.lvsClean = (metrics.lvsErrors ?? 0) === 0;

        // Antenna is clean if no antenna violations
        signoffStatus.antennaClean = (metrics.antennaViolations ?? 0) === 0;

        // Tapeout ready if all checks pass and XOR is clean
        signoffStatus.tapeoutReady =
          signoffStatus.timingClean &&
          signoffStatus.drcClean &&
          signoffStatus.lvsClean &&
          signoffStatus.antennaClean &&
          (metrics.xorDifference ?? 0) === 0;

      } catch {
        // JSON parse error
      }
    }

  } catch {
    // Ignore errors, return whatever we found
  }

  return { metrics, signoffStatus };
}

/**
 * Read OpenLane/LibreLane reports for a project
 * LibreLane stores reports in numbered step directories and final/metrics.json
 */
export async function readOpenlaneReports(projectId: string, reportType?: string): Promise<{
  success: boolean;
  runId?: string;
  reports?: Record<string, string>;
  metricsJson?: Record<string, any>;
  ppaMetrics?: SignoffMetrics;
  signoffStatus?: OpenlaneResult["signoffStatus"];
  designStatus?: {
    synthesisComplete: boolean;
    timingClean: boolean;
    routingComplete: boolean;
    drcClean: boolean;
    lvsClean: boolean;
  };
  error?: string;
}> {
  try {
    const project = projectManager.getProject(projectId);
    if (!project) {
      return {
        success: false,
        error: `Project ${projectId} not found`,
      };
    }

    const paths = projectManager.getProjectPaths(projectId);
    const { latestRun } = await findOpenlaneOutputs(projectId, paths.containerPath);

    if (!latestRun) {
      return {
        success: false,
        error: "No OpenLane runs found. Run OpenLane flow first.",
      };
    }

    const reports: Record<string, string> = {};
    const designStatus = {
      synthesisComplete: false,
      timingClean: false,
      routingComplete: false,
      drcClean: false,
      lvsClean: false,
    };

    // Read metrics.json first (LibreLane format - has all the key metrics)
    let metricsJson: Record<string, any> | undefined;
    const metricsCmd = `cat ${paths.containerPath}/runs/${latestRun}/final/metrics.json 2>/dev/null`;
    const metricsResult = await dockerManager.exec(metricsCmd, { workdir: paths.containerPath });

    if (metricsResult.success && metricsResult.stdout.trim()) {
      try {
        const parsedMetrics = JSON.parse(metricsResult.stdout);
        metricsJson = parsedMetrics;

        // Update design status from metrics
        designStatus.synthesisComplete = (parsedMetrics["design__instance__count"] || 0) > 0;
        designStatus.timingClean = (parsedMetrics["timing__setup__wns"] || 0) >= 0 &&
                                    (parsedMetrics["timing__hold__wns"] || 0) >= 0;
        designStatus.routingComplete = (parsedMetrics["route__wirelength"] || 0) > 0;
        designStatus.drcClean = (parsedMetrics["magic__drc_error__count"] || 0) === 0 &&
                                 (parsedMetrics["klayout__drc_error__count"] || 0) === 0;
        designStatus.lvsClean = (parsedMetrics["design__lvs_error__count"] || 0) === 0;
      } catch {
        // JSON parse error
      }
    }

    // LibreLane step directory mappings
    const stepMappings: Record<string, string> = {
      "synthesis": "06-yosys-synthesis",
      "placement": "33-openroad-detailedplacement",
      "cts": "34-openroad-cts",
      "routing": "43-openroad-detailedrouting",
      "signoff": "54-openroad-stapostpnr",
    };

    // Read specific report type or all
    const reportTypes = reportType ? [reportType] : ["synthesis", "placement", "routing", "signoff"];

    for (const type of reportTypes) {
      const stepDir = stepMappings[type] || type;
      // Look for reports in the step directory
      const readCmd = `find ${paths.containerPath}/runs/${latestRun}/*${stepDir}* -name "*.rpt" -o -name "*.log" 2>/dev/null | head -3 | xargs cat 2>/dev/null | head -500`;
      const result = await dockerManager.exec(readCmd, { workdir: paths.containerPath });

      if (result.success && result.stdout.trim()) {
        reports[type] = result.stdout.trim();
      }
    }

    // Also read flow.log summary
    const flowLogCmd = `tail -100 ${paths.containerPath}/runs/${latestRun}/flow.log 2>/dev/null`;
    const flowLogResult = await dockerManager.exec(flowLogCmd, { workdir: paths.containerPath });
    if (flowLogResult.success && flowLogResult.stdout.trim()) {
      reports["flow_summary"] = flowLogResult.stdout.trim();
    }

    // Parse comprehensive signoff metrics
    const { metrics: ppaMetrics, signoffStatus } = await parsePPAMetrics(paths.containerPath, latestRun);

    return {
      success: true,
      runId: latestRun,
      reports,
      metricsJson,
      ppaMetrics,
      signoffStatus,
      designStatus,
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Format OpenLane result for MCP response
 */
export function formatOpenlaneResult(result: OpenlaneResult): string {
  // Build tapeout readiness summary
  let tapeoutNote = "";
  if (result.signoffStatus) {
    const s = result.signoffStatus;
    if (s.tapeoutReady) {
      tapeoutNote = "✅ TAPEOUT READY - All signoff checks passed!";
    } else {
      const issues: string[] = [];
      if (!s.timingClean) issues.push("timing violations");
      if (!s.drcClean) issues.push("DRC errors");
      if (!s.lvsClean) issues.push("LVS errors");
      if (!s.antennaClean) issues.push("antenna violations");
      tapeoutNote = `⚠️ NOT TAPEOUT READY - Issues: ${issues.join(", ")}`;
    }
  }

  return JSON.stringify({
    project_id: result.projectId,
    run_id: result.runId,
    success: result.success,
    design_name: result.designName,
    host_path: result.hostPath,
    container_path: result.containerPath,
    latest_run: result.latestRun,
    gds_file: result.gdsFile || "Not generated",
    gds_path: result.gdsPath,
    signoff_metrics: result.ppaMetrics,
    signoff_status: result.signoffStatus,
    tapeout_summary: tapeoutNote,
    stdout: result.stdout ?
      (result.stdout.length > 3000 ? result.stdout.substring(0, 3000) + "...(truncated)" : result.stdout) :
      undefined,
    stderr: result.stderr ?
      (result.stderr.length > 2000 ? result.stderr.substring(0, 2000) + "...(truncated)" : result.stderr) :
      undefined,
    error: result.error,
    note: result.success ?
      `OpenLane flow completed. GDS: ${result.gdsFile || "N/A"}. Use view_gds with project_id '${result.projectId}' to open in KLayout via VNC.` :
      "OpenLane flow failed. Check the error message for details."
  }, null, 2);
}

/**
 * Format reports result for MCP response
 */
export function formatReportsResult(result: Awaited<ReturnType<typeof readOpenlaneReports>>): string {
  // Build tapeout readiness summary
  let tapeoutNote = "";
  if (result.signoffStatus) {
    const s = result.signoffStatus;
    if (s.tapeoutReady) {
      tapeoutNote = "✅ TAPEOUT READY - All signoff checks passed!";
    } else {
      const issues: string[] = [];
      if (!s.timingClean) issues.push("timing violations");
      if (!s.drcClean) issues.push("DRC errors");
      if (!s.lvsClean) issues.push("LVS errors");
      if (!s.antennaClean) issues.push("antenna violations");
      tapeoutNote = `⚠️ NOT TAPEOUT READY - Issues: ${issues.join(", ")}`;
    }
  }

  return JSON.stringify({
    success: result.success,
    run_id: result.runId,
    signoff_metrics: result.ppaMetrics,
    signoff_status: result.signoffStatus,
    tapeout_summary: tapeoutNote,
    design_status: result.designStatus,
    reports: result.reports,
    error: result.error,
  }, null, 2);
}
