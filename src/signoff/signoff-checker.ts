/**
 * Signoff Checker Module
 *
 * Runs all signoff checks required for tapeout:
 * - DRC (Design Rule Check) via Magic
 * - LVS (Layout vs Schematic) via Netgen
 * - Antenna Check via Magic/OpenROAD
 * - IR Drop Analysis via PDNSim
 * - Timing Signoff via OpenSTA
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Signoff check result
 */
export interface SignoffCheckResult {
  check: string;
  status: "pass" | "fail" | "warning" | "skipped" | "error";
  violations: number;
  details: string[];
  duration: number; // seconds
  reportPath?: string;
}

/**
 * DRC violation categories
 */
export interface DRCViolation {
  rule: string;
  layer: string;
  count: number;
  locations?: Array<{ x: number; y: number }>;
  severity: "error" | "warning";
}

/**
 * LVS comparison result
 */
export interface LVSResult {
  match: boolean;
  deviceMismatches: number;
  netMismatches: number;
  pinMismatches: number;
  details: string[];
}

/**
 * IR Drop result
 */
export interface IRDropResult {
  worstIRDrop: number; // mV
  worstLocation: { x: number; y: number };
  averageIRDrop: number;
  hotspots: Array<{ x: number; y: number; drop: number }>;
  withinSpec: boolean;
  maxAllowed: number;
}

/**
 * Timing signoff result
 */
export interface TimingSignoffResult {
  wns: number;
  tns: number;
  setupViolations: number;
  holdViolations: number;
  corners: Array<{
    name: string;
    wns: number;
    tns: number;
    violations: number;
  }>;
  metTiming: boolean;
}

/**
 * Complete signoff report
 */
export interface SignoffReport {
  design: string;
  timestamp: string;
  overallStatus: "pass" | "fail" | "warning";
  checks: SignoffCheckResult[];
  drc?: { violations: DRCViolation[]; totalCount: number };
  lvs?: LVSResult;
  antenna?: { violations: number; repaired: number };
  irDrop?: IRDropResult;
  timing?: TimingSignoffResult;
  tapeoutReady: boolean;
  blockers: string[];
  warnings: string[];
}

/**
 * Signoff configuration
 */
export interface SignoffConfig {
  runDir: string;
  gdsFile: string;
  netlistFile: string;
  platform: string;
  containerName?: string;
  checks: {
    drc: boolean;
    lvs: boolean;
    antenna: boolean;
    irDrop: boolean;
    timing: boolean;
  };
  limits: {
    maxIRDropMv?: number;
    minSlackNs?: number;
    maxDRCViolations?: number;
  };
}

/**
 * Run DRC check using Magic
 */
export async function runDRCCheck(
  config: SignoffConfig
): Promise<SignoffCheckResult> {
  const startTime = Date.now();
  const containerName = config.containerName || "mcp4eda";
  const violations: DRCViolation[] = [];

  try {
    // Convert paths for container
    const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");
    const reportPath = join(config.runDir, "reports", "signoff", "drc.rpt");

    // Run Magic DRC
    const drcScript = `
      drc euclidean on
      drc style drc(full)
      gds read ${containerRunDir}/${config.gdsFile}
      load ${config.platform}
      select top cell
      drc check
      drc catchup
      drc count total
      quit
    `;

    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "echo '${drcScript}' | magic -dnull -noconsole"`,
      { timeout: 600000 } // 10 minutes
    );

    // Parse DRC output
    const totalMatch = stdout.match(/Total DRC errors:\s*(\d+)/i) ||
                       stdout.match(/(\d+)\s*total/i);
    const totalViolations = totalMatch ? parseInt(totalMatch[1]) : 0;

    // Parse individual violations by rule
    const ruleMatches = stdout.matchAll(/(\w+)\s*:\s*(\d+)\s*error/gi);
    for (const match of ruleMatches) {
      violations.push({
        rule: match[1],
        layer: "unknown",
        count: parseInt(match[2]),
        severity: "error",
      });
    }

    const status = totalViolations === 0 ? "pass" :
                   (config.limits.maxDRCViolations && totalViolations <= config.limits.maxDRCViolations) ?
                   "warning" : "fail";

    return {
      check: "DRC",
      status,
      violations: totalViolations,
      details: violations.map(v => `${v.rule}: ${v.count} violations`),
      duration: (Date.now() - startTime) / 1000,
      reportPath,
    };
  } catch (error) {
    return {
      check: "DRC",
      status: "error",
      violations: -1,
      details: [error instanceof Error ? error.message : "Unknown error"],
      duration: (Date.now() - startTime) / 1000,
    };
  }
}

/**
 * Run LVS check using Netgen
 */
export async function runLVSCheck(
  config: SignoffConfig
): Promise<SignoffCheckResult> {
  const startTime = Date.now();
  const containerName = config.containerName || "mcp4eda";

  try {
    const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");
    const reportPath = join(config.runDir, "reports", "signoff", "lvs.rpt");

    // Run Netgen LVS
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && netgen -batch lvs \
        '${config.gdsFile} ${config.platform}' \
        '${config.netlistFile} ${config.platform}' \
        ${config.platform}_setup.tcl \
        ${containerRunDir}/reports/signoff/lvs.rpt"`,
      { timeout: 600000 }
    );

    // Parse LVS result
    const matchLine = stdout.match(/Circuits match/i);
    const mismatchLine = stdout.match(/Circuits do not match/i);
    const deviceMismatch = stdout.match(/Device mismatches:\s*(\d+)/i);
    const netMismatch = stdout.match(/Net mismatches:\s*(\d+)/i);

    const isMatch = matchLine && !mismatchLine;
    const devices = deviceMismatch ? parseInt(deviceMismatch[1]) : 0;
    const nets = netMismatch ? parseInt(netMismatch[1]) : 0;

    return {
      check: "LVS",
      status: isMatch ? "pass" : "fail",
      violations: devices + nets,
      details: [
        isMatch ? "Circuits match" : "Circuits DO NOT match",
        `Device mismatches: ${devices}`,
        `Net mismatches: ${nets}`,
      ],
      duration: (Date.now() - startTime) / 1000,
      reportPath,
    };
  } catch (error) {
    return {
      check: "LVS",
      status: "error",
      violations: -1,
      details: [error instanceof Error ? error.message : "Unknown error"],
      duration: (Date.now() - startTime) / 1000,
    };
  }
}

/**
 * Run Antenna check using OpenROAD
 */
export async function runAntennaCheck(
  config: SignoffConfig
): Promise<SignoffCheckResult> {
  const startTime = Date.now();
  const containerName = config.containerName || "mcp4eda";

  try {
    const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");
    const reportPath = join(config.runDir, "reports", "signoff", "antenna.rpt");

    // Run OpenROAD antenna check
    // Uses platform vars file if available, otherwise tries direct LEF load
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<'OREOF'
        # Try to source platform variables
        if {[file exists ${config.platform}.vars]} {
          source ${config.platform}.vars
          read_lef \$TECH_LEF
          read_lef \$SC_LEF
        } else {
          # Fallback: try common LEF locations
          foreach lef [glob -nocomplain *.lef platforms/*.lef] {
            read_lef \$lef
          }
        }
        read_def results/final.def
        check_antennas -verbose
OREOF"`,
      { timeout: 300000 }
    );

    // Parse antenna violations
    const violationMatch = stdout.match(/(\d+)\s*antenna violations/i);
    const violations = violationMatch ? parseInt(violationMatch[1]) : 0;

    // Check for no violations message
    const noViolations = stdout.toLowerCase().includes("no antenna violations");

    return {
      check: "Antenna",
      status: noViolations || violations === 0 ? "pass" : "fail",
      violations,
      details: [
        violations === 0 ? "No antenna violations" : `${violations} antenna violations found`,
      ],
      duration: (Date.now() - startTime) / 1000,
      reportPath,
    };
  } catch (error) {
    return {
      check: "Antenna",
      status: "error",
      violations: -1,
      details: [error instanceof Error ? error.message : "Unknown error"],
      duration: (Date.now() - startTime) / 1000,
    };
  }
}

/**
 * Run IR Drop analysis using PDNSim
 */
export async function runIRDropAnalysis(
  config: SignoffConfig
): Promise<SignoffCheckResult> {
  const startTime = Date.now();
  const containerName = config.containerName || "mcp4eda";
  const maxAllowed = config.limits.maxIRDropMv || 50; // Default 50mV

  try {
    const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");

    // Run PDNSim analysis
    // Note: analyze_power_grid requires -net parameter
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<EOF
        source ${config.platform}.vars
        read_lef \\$TECH_LEF
        read_lef \\$SC_LEF
        read_def results/final.def
        read_liberty \\$LIB_FILES
        read_spef results/final.spef
        analyze_power_grid -net VDD
        analyze_power_grid -net VSS
        EOF"`,
      { timeout: 300000 }
    );

    // Parse IR drop result
    const worstMatch = stdout.match(/worst\s*IR\s*drop[:\s]+([\d.]+)\s*([mM]?[vV])/i);
    let worstDrop = 0;
    if (worstMatch) {
      worstDrop = parseFloat(worstMatch[1]);
      if (worstMatch[2].toLowerCase() === "v") worstDrop *= 1000; // Convert V to mV
    }

    const withinSpec = worstDrop <= maxAllowed;

    return {
      check: "IR Drop",
      status: withinSpec ? "pass" : "fail",
      violations: withinSpec ? 0 : 1,
      details: [
        `Worst IR drop: ${worstDrop.toFixed(2)} mV`,
        `Maximum allowed: ${maxAllowed} mV`,
        withinSpec ? "Within specification" : "EXCEEDS specification",
      ],
      duration: (Date.now() - startTime) / 1000,
    };
  } catch (error) {
    return {
      check: "IR Drop",
      status: "error",
      violations: -1,
      details: [error instanceof Error ? error.message : "Unknown error"],
      duration: (Date.now() - startTime) / 1000,
    };
  }
}

/**
 * Run Timing signoff using OpenSTA
 */
export async function runTimingSignoff(
  config: SignoffConfig
): Promise<SignoffCheckResult> {
  const startTime = Date.now();
  const containerName = config.containerName || "mcp4eda";
  const minSlack = config.limits.minSlackNs || 0;

  try {
    const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");

    // Run OpenSTA timing analysis
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<EOF
        read_lef ${config.platform}.lef
        read_def results/final.def
        read_liberty ${config.platform}.lib
        read_spef results/final.spef
        read_sdc results/final.sdc
        report_checks -path_delay max -format full_clock_expanded
        report_checks -path_delay min -format full_clock_expanded
        report_wns
        report_tns
        EOF"`,
      { timeout: 300000 }
    );

    // Parse timing results
    const wnsMatch = stdout.match(/wns[:\s]+([-\d.]+)/i);
    const tnsMatch = stdout.match(/tns[:\s]+([-\d.]+)/i);

    const wns = wnsMatch ? parseFloat(wnsMatch[1]) : 0;
    const tns = tnsMatch ? parseFloat(tnsMatch[1]) : 0;

    const metTiming = wns >= minSlack;
    const setupViolations = wns < 0 ? 1 : 0;

    return {
      check: "Timing",
      status: metTiming ? "pass" : "fail",
      violations: setupViolations,
      details: [
        `WNS: ${wns.toFixed(3)} ns`,
        `TNS: ${tns.toFixed(3)} ns`,
        metTiming ? "Timing MET" : "Timing VIOLATED",
      ],
      duration: (Date.now() - startTime) / 1000,
    };
  } catch (error) {
    return {
      check: "Timing",
      status: "error",
      violations: -1,
      details: [error instanceof Error ? error.message : "Unknown error"],
      duration: (Date.now() - startTime) / 1000,
    };
  }
}

/**
 * Run all signoff checks
 */
export async function runAllSignoffChecks(
  config: SignoffConfig
): Promise<SignoffReport> {
  const checks: SignoffCheckResult[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  console.log("=== Starting Signoff Checks ===\n");

  // Run DRC
  if (config.checks.drc) {
    console.log("Running DRC check...");
    const drcResult = await runDRCCheck(config);
    checks.push(drcResult);
    if (drcResult.status === "fail") blockers.push(`DRC: ${drcResult.violations} violations`);
    if (drcResult.status === "warning") warnings.push(`DRC: ${drcResult.violations} warnings`);
    console.log(`  DRC: ${drcResult.status.toUpperCase()}\n`);
  }

  // Run LVS
  if (config.checks.lvs) {
    console.log("Running LVS check...");
    const lvsResult = await runLVSCheck(config);
    checks.push(lvsResult);
    if (lvsResult.status === "fail") blockers.push("LVS: Circuits do not match");
    console.log(`  LVS: ${lvsResult.status.toUpperCase()}\n`);
  }

  // Run Antenna
  if (config.checks.antenna) {
    console.log("Running Antenna check...");
    const antennaResult = await runAntennaCheck(config);
    checks.push(antennaResult);
    if (antennaResult.status === "fail") blockers.push(`Antenna: ${antennaResult.violations} violations`);
    console.log(`  Antenna: ${antennaResult.status.toUpperCase()}\n`);
  }

  // Run IR Drop
  if (config.checks.irDrop) {
    console.log("Running IR Drop analysis...");
    const irResult = await runIRDropAnalysis(config);
    checks.push(irResult);
    if (irResult.status === "fail") blockers.push("IR Drop exceeds limit");
    console.log(`  IR Drop: ${irResult.status.toUpperCase()}\n`);
  }

  // Run Timing
  if (config.checks.timing) {
    console.log("Running Timing signoff...");
    const timingResult = await runTimingSignoff(config);
    checks.push(timingResult);
    if (timingResult.status === "fail") blockers.push("Timing violations");
    console.log(`  Timing: ${timingResult.status.toUpperCase()}\n`);
  }

  // Determine overall status
  const hasFailure = checks.some(c => c.status === "fail");
  const hasWarning = checks.some(c => c.status === "warning");
  const hasError = checks.some(c => c.status === "error");

  const overallStatus: "pass" | "fail" | "warning" =
    hasFailure || hasError ? "fail" : hasWarning ? "warning" : "pass";

  const report: SignoffReport = {
    design: config.gdsFile.replace(".gds", ""),
    timestamp: new Date().toISOString(),
    overallStatus,
    checks,
    tapeoutReady: overallStatus === "pass",
    blockers,
    warnings,
  };

  console.log("=== Signoff Summary ===");
  console.log(`Overall Status: ${overallStatus.toUpperCase()}`);
  console.log(`Tapeout Ready: ${report.tapeoutReady ? "YES" : "NO"}`);
  if (blockers.length > 0) {
    console.log("\nBlockers:");
    blockers.forEach(b => console.log(`  - ${b}`));
  }
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  return report;
}

/**
 * Generate signoff report file
 */
export async function generateSignoffReport(
  report: SignoffReport,
  outputPath: string
): Promise<void> {
  const content = `
# Signoff Report
Design: ${report.design}
Timestamp: ${report.timestamp}
Overall Status: ${report.overallStatus.toUpperCase()}
Tapeout Ready: ${report.tapeoutReady ? "YES" : "NO"}

## Check Results

${report.checks.map(c => `
### ${c.check}
- Status: ${c.status.toUpperCase()}
- Violations: ${c.violations}
- Duration: ${c.duration.toFixed(1)}s
${c.details.map(d => `- ${d}`).join("\n")}
`).join("\n")}

## Blockers
${report.blockers.length > 0 ? report.blockers.map(b => `- ${b}`).join("\n") : "None"}

## Warnings
${report.warnings.length > 0 ? report.warnings.map(w => `- ${w}`).join("\n") : "None"}
`;

  await writeFile(outputPath, content.trim(), "utf-8");
}

/**
 * Quick DRC-only check
 */
export async function quickDRCCheck(
  runDir: string,
  gdsFile: string,
  platform: string
): Promise<{ pass: boolean; violations: number; details: string[] }> {
  const result = await runDRCCheck({
    runDir,
    gdsFile,
    netlistFile: "",
    platform,
    checks: { drc: true, lvs: false, antenna: false, irDrop: false, timing: false },
    limits: {},
  });

  return {
    pass: result.status === "pass",
    violations: result.violations,
    details: result.details,
  };
}

/**
 * Quick timing check
 */
export async function quickTimingCheck(
  runDir: string,
  platform: string
): Promise<{ pass: boolean; wns: number; tns: number }> {
  const result = await runTimingSignoff({
    runDir,
    gdsFile: "",
    netlistFile: "",
    platform,
    checks: { drc: false, lvs: false, antenna: false, irDrop: false, timing: true },
    limits: {},
  });

  const wnsMatch = result.details.find(d => d.includes("WNS"));
  const tnsMatch = result.details.find(d => d.includes("TNS"));

  return {
    pass: result.status === "pass",
    wns: wnsMatch ? parseFloat(wnsMatch.split(":")[1]) : 0,
    tns: tnsMatch ? parseFloat(tnsMatch.split(":")[1]) : 0,
  };
}
