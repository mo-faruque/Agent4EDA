/**
 * PPA Metrics Extractor
 *
 * Extracts Performance, Power, and Area metrics from OpenLane/OpenROAD
 * report files for analysis and optimization.
 */

import { readFile, access, readdir } from "fs/promises";
import { join, basename } from "path";
import type { PPAMetrics } from "../types/project.js";

/**
 * Extended PPA metrics with additional details
 */
export interface ExtendedPPAMetrics extends PPAMetrics {
  // Timing
  clockPeriodNs?: number;
  setupSlack?: number;
  holdSlack?: number;
  criticalPathDelay?: number;

  // Area breakdown
  coreAreaUm2?: number;
  dieAreaUm2?: number;
  utilizationPercent?: number;

  // Power breakdown
  dynamicPowerMw?: number;
  leakagePowerMw?: number;
  switchingPowerMw?: number;

  // Cell statistics
  stdCellCount?: number;
  bufferCount?: number;
  inverterCount?: number;
  sequentialCount?: number;
  combinationalCount?: number;

  // Routing
  wireLength?: number;
  viaCount?: number;
  routingOverflow?: number;

  // DRC/LVS
  drcViolations?: number;
  antennaViolations?: number;
}

/**
 * Design complexity analysis
 */
export interface DesignComplexity {
  cellCount: number;
  hierarchyDepth: number;
  portCount: number;
  netCount: number;
  macroCount: number;
  memoryInstances: number;
  complexityScore: "simple" | "medium" | "complex" | "very_complex";
}

/**
 * Parse OpenLane metrics from final_summary_report.csv
 */
export async function parseOpenLaneMetrics(
  reportDir: string
): Promise<ExtendedPPAMetrics | null> {
  const metrics: ExtendedPPAMetrics = {
    id: 0,
    runId: "",
  };

  try {
    // Try to find reports directory
    const reportsPath = join(reportDir, "reports");
    const finalReportPath = join(reportDir, "reports", "metrics.csv");
    const summaryPath = join(reportDir, "reports", "final_summary_report.csv");

    // Check for metrics.csv first (OpenLane 2.x format)
    try {
      await access(finalReportPath);
      const content = await readFile(finalReportPath, "utf-8");
      parseMetricsCsv(content, metrics);
    } catch {
      // Try final_summary_report.csv (older format)
      try {
        await access(summaryPath);
        const content = await readFile(summaryPath, "utf-8");
        parseSummaryReport(content, metrics);
      } catch {
        // Look for individual report files
      }
    }

    // Parse timing report
    await parseTiming(reportDir, metrics);

    // Parse power report
    await parsePower(reportDir, metrics);

    // Parse area report
    await parseArea(reportDir, metrics);

    // Parse cell count
    await parseCellCount(reportDir, metrics);

    // Parse DRC report
    await parseDrc(reportDir, metrics);

    return metrics;
  } catch (error) {
    console.error("Error parsing metrics:", error);
    return null;
  }
}

/**
 * Parse metrics.csv format (OpenLane 2.x)
 */
function parseMetricsCsv(content: string, metrics: ExtendedPPAMetrics): void {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return;

  const headers = lines[0].split(",").map((h) => h.trim());
  const values = lines[lines.length - 1].split(",").map((v) => v.trim());

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();
    const value = parseFloat(values[i]);

    if (isNaN(value)) continue;

    // Map common metric names
    if (header.includes("die_area") || header === "diearea") {
      metrics.dieAreaUm2 = value;
      metrics.areaUm2 = value;
    } else if (header.includes("core_area")) {
      metrics.coreAreaUm2 = value;
    } else if (header.includes("utilization") || header === "util") {
      metrics.utilizationPercent = value;
    } else if (header.includes("wns") || header === "worst_slack") {
      metrics.wnsNs = value;
    } else if (header.includes("tns") || header === "total_slack") {
      metrics.tnsNs = value;
    } else if (header.includes("total_power") || header === "power") {
      metrics.powerMw = value;
    } else if (header.includes("cell_count") || header === "cells") {
      metrics.cellCount = Math.round(value);
    } else if (header.includes("wire_length")) {
      metrics.wireLength = value;
    } else if (header.includes("via_count")) {
      metrics.viaCount = Math.round(value);
    }
  }
}

/**
 * Parse final_summary_report.csv format
 */
function parseSummaryReport(
  content: string,
  metrics: ExtendedPPAMetrics
): void {
  const lines = content.trim().split("\n");

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 2) continue;

    const key = parts[0].toLowerCase();
    const value = parseFloat(parts[1]);

    if (isNaN(value)) continue;

    if (key.includes("die_area")) {
      metrics.dieAreaUm2 = value;
      metrics.areaUm2 = value;
    } else if (key.includes("core_area")) {
      metrics.coreAreaUm2 = value;
    } else if (key.includes("utilization")) {
      metrics.utilizationPercent = value;
    } else if (key.includes("wns")) {
      metrics.wnsNs = value;
    } else if (key.includes("tns")) {
      metrics.tnsNs = value;
    } else if (key.includes("power")) {
      metrics.powerMw = value;
    } else if (key.includes("cell") && key.includes("count")) {
      metrics.cellCount = Math.round(value);
    }
  }
}

/**
 * Parse timing reports
 */
async function parseTiming(
  reportDir: string,
  metrics: ExtendedPPAMetrics
): Promise<void> {
  const timingPaths = [
    join(reportDir, "reports", "signoff", "timing.rpt"),
    join(reportDir, "reports", "routing", "timing.rpt"),
    join(reportDir, "reports", "cts", "timing.rpt"),
  ];

  for (const path of timingPaths) {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");

      // Parse WNS (Worst Negative Slack)
      const wnsMatch = content.match(/wns\s*[=:]\s*([-\d.]+)/i);
      if (wnsMatch && metrics.wnsNs === undefined) {
        metrics.wnsNs = parseFloat(wnsMatch[1]);
      }

      // Parse TNS (Total Negative Slack)
      const tnsMatch = content.match(/tns\s*[=:]\s*([-\d.]+)/i);
      if (tnsMatch && metrics.tnsNs === undefined) {
        metrics.tnsNs = parseFloat(tnsMatch[1]);
      }

      // Parse slack from report
      const slackMatch = content.match(
        /slack\s*\(?(?:MET|VIOLATED)?\)?\s*([-\d.]+)/i
      );
      if (slackMatch && metrics.setupSlack === undefined) {
        metrics.setupSlack = parseFloat(slackMatch[1]);
      }

      // Parse clock period
      const periodMatch = content.match(/clock\s+period[:\s]+([\d.]+)/i);
      if (periodMatch && metrics.clockPeriodNs === undefined) {
        metrics.clockPeriodNs = parseFloat(periodMatch[1]);
      }

      // Calculate frequency if we have clock period
      if (metrics.clockPeriodNs && metrics.frequencyMhz === undefined) {
        metrics.frequencyMhz = 1000 / metrics.clockPeriodNs;
      }

      break; // Found a valid timing report
    } catch {
      continue;
    }
  }
}

/**
 * Parse power reports
 */
async function parsePower(
  reportDir: string,
  metrics: ExtendedPPAMetrics
): Promise<void> {
  const powerPaths = [
    join(reportDir, "reports", "signoff", "power.rpt"),
    join(reportDir, "reports", "routing", "power.rpt"),
  ];

  for (const path of powerPaths) {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");

      // Parse total power (look for mW or uW)
      const totalMatch = content.match(
        /total\s+power[:\s]+([\d.]+)\s*(mw|uw|w)/i
      );
      if (totalMatch) {
        let power = parseFloat(totalMatch[1]);
        const unit = totalMatch[2].toLowerCase();
        if (unit === "uw") power /= 1000;
        else if (unit === "w") power *= 1000;
        metrics.powerMw = power;
      }

      // Parse internal/switching/leakage
      const internalMatch = content.match(
        /internal\s+power[:\s]+([\d.]+)\s*(mw|uw)?/i
      );
      const switchingMatch = content.match(
        /switching\s+power[:\s]+([\d.]+)\s*(mw|uw)?/i
      );
      const leakageMatch = content.match(
        /leakage\s+power[:\s]+([\d.]+)\s*(mw|uw)?/i
      );

      if (switchingMatch) {
        metrics.switchingPowerMw = parseFloat(switchingMatch[1]);
        if (switchingMatch[2]?.toLowerCase() === "uw") {
          metrics.switchingPowerMw /= 1000;
        }
      }

      if (leakageMatch) {
        metrics.leakagePowerMw = parseFloat(leakageMatch[1]);
        if (leakageMatch[2]?.toLowerCase() === "uw") {
          metrics.leakagePowerMw /= 1000;
        }
      }

      if (
        metrics.switchingPowerMw !== undefined ||
        metrics.leakagePowerMw !== undefined
      ) {
        metrics.dynamicPowerMw =
          (metrics.switchingPowerMw || 0) +
          (metrics.powerMw || 0) -
          (metrics.leakagePowerMw || 0);
      }

      break;
    } catch {
      continue;
    }
  }
}

/**
 * Parse area reports
 */
async function parseArea(
  reportDir: string,
  metrics: ExtendedPPAMetrics
): Promise<void> {
  const areaPaths = [
    join(reportDir, "reports", "signoff", "area.rpt"),
    join(reportDir, "reports", "floorplan", "core_area.rpt"),
  ];

  for (const path of areaPaths) {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");

      // Parse die area
      const dieMatch = content.match(/die\s+area[:\s]+([\d.]+)/i);
      if (dieMatch && metrics.dieAreaUm2 === undefined) {
        metrics.dieAreaUm2 = parseFloat(dieMatch[1]);
        metrics.areaUm2 = metrics.dieAreaUm2;
      }

      // Parse core area
      const coreMatch = content.match(/core\s+area[:\s]+([\d.]+)/i);
      if (coreMatch && metrics.coreAreaUm2 === undefined) {
        metrics.coreAreaUm2 = parseFloat(coreMatch[1]);
      }

      // Parse utilization
      const utilMatch = content.match(/utilization[:\s]+([\d.]+)/i);
      if (utilMatch && metrics.utilizationPercent === undefined) {
        metrics.utilizationPercent = parseFloat(utilMatch[1]);
      }

      break;
    } catch {
      continue;
    }
  }
}

/**
 * Parse cell count from synthesis or placement reports
 */
async function parseCellCount(
  reportDir: string,
  metrics: ExtendedPPAMetrics
): Promise<void> {
  const cellPaths = [
    join(reportDir, "reports", "synthesis", "stat.rpt"),
    join(reportDir, "reports", "placement", "statistics.rpt"),
  ];

  for (const path of cellPaths) {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");

      // Parse total cells
      const cellMatch = content.match(
        /(?:number of cells|total cells)[:\s]+([\d]+)/i
      );
      if (cellMatch && metrics.cellCount === undefined) {
        metrics.cellCount = parseInt(cellMatch[1]);
      }

      // Parse cell types
      const seqMatch = content.match(
        /(?:sequential|flip.?flops?|registers?)[:\s]+([\d]+)/i
      );
      if (seqMatch) {
        metrics.sequentialCount = parseInt(seqMatch[1]);
      }

      const combMatch = content.match(/(?:combinational)[:\s]+([\d]+)/i);
      if (combMatch) {
        metrics.combinationalCount = parseInt(combMatch[1]);
      }

      const bufMatch = content.match(/(?:buffers?)[:\s]+([\d]+)/i);
      if (bufMatch) {
        metrics.bufferCount = parseInt(bufMatch[1]);
      }

      const invMatch = content.match(/(?:inverters?)[:\s]+([\d]+)/i);
      if (invMatch) {
        metrics.inverterCount = parseInt(invMatch[1]);
      }

      break;
    } catch {
      continue;
    }
  }
}

/**
 * Parse DRC reports
 */
async function parseDrc(
  reportDir: string,
  metrics: ExtendedPPAMetrics
): Promise<void> {
  const drcPaths = [
    join(reportDir, "reports", "signoff", "drc.rpt"),
    join(reportDir, "reports", "routing", "drc.rpt"),
  ];

  for (const path of drcPaths) {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");

      // Parse DRC violations
      const drcMatch = content.match(
        /(?:total\s+violations?|drc\s+violations?)[:\s]+([\d]+)/i
      );
      if (drcMatch) {
        metrics.drcViolations = parseInt(drcMatch[1]);
      }

      // Check for "No violations" message
      if (content.toLowerCase().includes("no violations")) {
        metrics.drcViolations = 0;
      }

      break;
    } catch {
      continue;
    }
  }

  // Parse antenna violations separately
  const antennaPaths = [
    join(reportDir, "reports", "signoff", "antenna.rpt"),
    join(reportDir, "reports", "routing", "antenna.rpt"),
  ];

  for (const path of antennaPaths) {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");

      const antennaMatch = content.match(
        /(?:antenna\s+violations?)[:\s]+([\d]+)/i
      );
      if (antennaMatch) {
        metrics.antennaViolations = parseInt(antennaMatch[1]);
      }

      if (
        content.toLowerCase().includes("no antenna violations") ||
        content.toLowerCase().includes("0 violations")
      ) {
        metrics.antennaViolations = 0;
      }

      break;
    } catch {
      continue;
    }
  }
}

/**
 * Analyze design complexity from synthesis report
 */
export async function analyzeDesignComplexity(
  reportDir: string
): Promise<DesignComplexity | null> {
  try {
    const synthPath = join(reportDir, "reports", "synthesis", "stat.rpt");
    const content = await readFile(synthPath, "utf-8");

    const complexity: DesignComplexity = {
      cellCount: 0,
      hierarchyDepth: 1,
      portCount: 0,
      netCount: 0,
      macroCount: 0,
      memoryInstances: 0,
      complexityScore: "simple",
    };

    // Parse cell count
    const cellMatch = content.match(/number of cells[:\s]+([\d]+)/i);
    if (cellMatch) {
      complexity.cellCount = parseInt(cellMatch[1]);
    }

    // Parse hierarchy
    const hierMatch = content.match(/hierarchy depth[:\s]+([\d]+)/i);
    if (hierMatch) {
      complexity.hierarchyDepth = parseInt(hierMatch[1]);
    }

    // Parse ports
    const portMatch = content.match(
      /(?:input|output|inout)\s+ports?[:\s]+([\d]+)/gi
    );
    if (portMatch) {
      for (const match of portMatch) {
        const num = match.match(/[\d]+/);
        if (num) {
          complexity.portCount += parseInt(num[0]);
        }
      }
    }

    // Parse nets
    const netMatch = content.match(/(?:number of nets|nets)[:\s]+([\d]+)/i);
    if (netMatch) {
      complexity.netCount = parseInt(netMatch[1]);
    }

    // Parse macros/memories
    const macroMatch = content.match(/(?:macros|hard macros)[:\s]+([\d]+)/i);
    if (macroMatch) {
      complexity.macroCount = parseInt(macroMatch[1]);
    }

    const memMatch = content.match(/(?:memory|ram|rom)[:\s]+([\d]+)/i);
    if (memMatch) {
      complexity.memoryInstances = parseInt(memMatch[1]);
    }

    // Calculate complexity score
    const score =
      complexity.cellCount +
      complexity.hierarchyDepth * 100 +
      complexity.macroCount * 500 +
      complexity.memoryInstances * 1000;

    if (score < 1000) {
      complexity.complexityScore = "simple";
    } else if (score < 10000) {
      complexity.complexityScore = "medium";
    } else if (score < 100000) {
      complexity.complexityScore = "complex";
    } else {
      complexity.complexityScore = "very_complex";
    }

    return complexity;
  } catch {
    return null;
  }
}

/**
 * Compare two sets of PPA metrics
 */
export function compareMetrics(
  baseline: ExtendedPPAMetrics,
  candidate: ExtendedPPAMetrics
): {
  areaChange: number;
  powerChange: number;
  frequencyChange: number;
  timingImproved: boolean;
  overallImprovement: number;
} {
  const areaChange =
    baseline.areaUm2 && candidate.areaUm2
      ? ((candidate.areaUm2 - baseline.areaUm2) / baseline.areaUm2) * 100
      : 0;

  const powerChange =
    baseline.powerMw && candidate.powerMw
      ? ((candidate.powerMw - baseline.powerMw) / baseline.powerMw) * 100
      : 0;

  const frequencyChange =
    baseline.frequencyMhz && candidate.frequencyMhz
      ? ((candidate.frequencyMhz - baseline.frequencyMhz) /
          baseline.frequencyMhz) *
        100
      : 0;

  // Check if timing improved (WNS closer to 0 or positive)
  const baselineWns = baseline.wnsNs || 0;
  const candidateWns = candidate.wnsNs || 0;
  const timingImproved = candidateWns > baselineWns;

  // Calculate overall improvement (negative area/power is good, positive frequency is good)
  const overallImprovement =
    -areaChange * 0.33 - powerChange * 0.33 + frequencyChange * 0.34;

  return {
    areaChange,
    powerChange,
    frequencyChange,
    timingImproved,
    overallImprovement,
  };
}

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: ExtendedPPAMetrics): string {
  const lines: string[] = [];

  lines.push("=== PPA Metrics ===");
  lines.push("");

  // Timing
  lines.push("Timing:");
  if (metrics.clockPeriodNs !== undefined) {
    lines.push(`  Clock Period: ${metrics.clockPeriodNs.toFixed(2)} ns`);
  }
  if (metrics.frequencyMhz !== undefined) {
    lines.push(`  Frequency: ${metrics.frequencyMhz.toFixed(2)} MHz`);
  }
  if (metrics.wnsNs !== undefined) {
    lines.push(`  WNS: ${metrics.wnsNs.toFixed(3)} ns`);
  }
  if (metrics.tnsNs !== undefined) {
    lines.push(`  TNS: ${metrics.tnsNs.toFixed(3)} ns`);
  }

  // Area
  lines.push("");
  lines.push("Area:");
  if (metrics.dieAreaUm2 !== undefined) {
    lines.push(`  Die Area: ${metrics.dieAreaUm2.toFixed(2)} um²`);
  }
  if (metrics.coreAreaUm2 !== undefined) {
    lines.push(`  Core Area: ${metrics.coreAreaUm2.toFixed(2)} um²`);
  }
  if (metrics.utilizationPercent !== undefined) {
    lines.push(`  Utilization: ${metrics.utilizationPercent.toFixed(1)}%`);
  }

  // Power
  lines.push("");
  lines.push("Power:");
  if (metrics.powerMw !== undefined) {
    lines.push(`  Total Power: ${metrics.powerMw.toFixed(4)} mW`);
  }
  if (metrics.dynamicPowerMw !== undefined) {
    lines.push(`  Dynamic: ${metrics.dynamicPowerMw.toFixed(4)} mW`);
  }
  if (metrics.leakagePowerMw !== undefined) {
    lines.push(`  Leakage: ${metrics.leakagePowerMw.toFixed(4)} mW`);
  }

  // Cells
  lines.push("");
  lines.push("Cells:");
  if (metrics.cellCount !== undefined) {
    lines.push(`  Total Cells: ${metrics.cellCount}`);
  }
  if (metrics.sequentialCount !== undefined) {
    lines.push(`  Sequential: ${metrics.sequentialCount}`);
  }
  if (metrics.combinationalCount !== undefined) {
    lines.push(`  Combinational: ${metrics.combinationalCount}`);
  }

  // DRC
  if (
    metrics.drcViolations !== undefined ||
    metrics.antennaViolations !== undefined
  ) {
    lines.push("");
    lines.push("Design Rules:");
    if (metrics.drcViolations !== undefined) {
      lines.push(`  DRC Violations: ${metrics.drcViolations}`);
    }
    if (metrics.antennaViolations !== undefined) {
      lines.push(`  Antenna Violations: ${metrics.antennaViolations}`);
    }
  }

  return lines.join("\n");
}

/**
 * Find the latest run directory in a project
 */
export async function findLatestRunDir(
  projectDir: string
): Promise<string | null> {
  try {
    const runsDir = join(projectDir, "runs");
    const entries = await readdir(runsDir, { withFileTypes: true });

    const runDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        path: join(runsDir, e.name),
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Most recent first

    return runDirs.length > 0 ? runDirs[0].path : null;
  } catch {
    return null;
  }
}
