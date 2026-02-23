#!/usr/bin/env node

/**
 * MCP4EDA - Model Context Protocol Server for Electronic Design Automation
 *
 * This server provides EDA tools (Yosys, Icarus Verilog, OpenLane) via MCP,
 * running all tools inside a Docker container with VNC for GUI access.
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Import refactored tools
import {
  synthesizeVerilog,
  formatSynthesisResult,
  simulateVerilog,
  formatSimulationResult,
  runOpenlane,
  readOpenlaneReports,
  formatOpenlaneResult,
  formatReportsResult,
  viewWaveform,
  viewGds,
  formatViewerResult,
  getVncInfo,
  projectManager,
  dockerManager,
  // RAG tools
  checkRAGStatus,
  formatRAGResult,
  searchEDADocs,
  getConfigHelp,
  explainError,
  getAutoTunerHelp,
  getStepInfo,
  getTopicHelp,
  // Tuner tools
  checkTunerStatus,
  suggestTuningParams,
  getPPAMetrics,
  generateTunerConfig,
  runAutoTunerTool,
  stopAutoTunerTool,
  getTuningResults,
  listTunableParameters,
  quickTuningAnalysis,
  formatPPAMetrics,
  formatTunerResults,
  // Optimized run tool
  runOptimizedOpenlaneTool,
  formatOptimizedRunResult,
} from "./tools/index.js";

// Import signoff tools
import {
  signoffToolHandlers,
} from "./tools/signoff-tools.js";

// Helper functions for parameter extraction
function getStringProperty(obj: any, key: string, defaultValue = ""): string {
  if (obj && typeof obj === "object" && key in obj) {
    const value = obj[key];
    return typeof value === "string" ? value : defaultValue;
  }
  return defaultValue;
}

function getNumberProperty(obj: any, key: string, defaultValue = 10.0): number {
  if (obj && typeof obj === "object" && key in obj) {
    const value = obj[key];
    return typeof value === "number" ? value : defaultValue;
  }
  return defaultValue;
}

function getBooleanProperty(obj: any, key: string, defaultValue = true): boolean {
  if (obj && typeof obj === "object" && key in obj) {
    const value = obj[key];
    return typeof value === "boolean" ? value : defaultValue;
  }
  return defaultValue;
}

function getArrayProperty(obj: any, key: string): string[] | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return undefined;
}

function validateRequiredString(obj: any, key: string, toolName: string): string {
  const value = getStringProperty(obj, key);
  if (!value) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing required parameter '${key}' for tool '${toolName}'`
    );
  }
  return value;
}

/**
 * Find the latest OpenLane run directory for a project
 */
async function findLatestRunForProject(projectId: string): Promise<{ latestRun?: string }> {
  const paths = projectManager.getProjectPaths(projectId);
  const listRunsCmd = `ls -t ${paths.containerPath}/runs 2>/dev/null | head -1`;
  const result = await dockerManager.exec(listRunsCmd, { workdir: paths.containerPath });
  return { latestRun: result.success && result.stdout.trim() ? result.stdout.trim() : undefined };
}

// Initialize the MCP server
const server = new Server(
  { name: "mcp4eda", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// Tool definitions
const tools = [
  {
    name: "synthesize_verilog",
    description:
      "Synthesize Verilog code using Yosys in Docker. Supports generic, ice40, xilinx, and sky130 targets. Can accept either inline verilog_code OR an array of verilog_files paths.",
    inputSchema: {
      type: "object",
      properties: {
        verilog_code: {
          type: "string",
          description: "The Verilog source code to synthesize (use this OR verilog_files)",
        },
        verilog_files: {
          type: "array",
          items: { type: "string" },
          description: "Array of Verilog file paths to synthesize (use this OR verilog_code)",
        },
        top_module: {
          type: "string",
          description: "Name of the top-level module",
        },
        target: {
          type: "string",
          description: "Target technology (generic, ice40, xilinx, sky130)",
          default: "generic",
        },
        project_id: {
          type: "string",
          description: "Optional: existing project ID to use",
        },
        project_name: {
          type: "string",
          description: "Optional: name for new project",
        },
      },
      required: ["top_module"],
    },
  },
  {
    name: "simulate_verilog",
    description:
      "Simulate Verilog code using Icarus Verilog in Docker. Generates VCD waveforms.",
    inputSchema: {
      type: "object",
      properties: {
        verilog_code: {
          type: "string",
          description: "The Verilog design code",
        },
        testbench_code: {
          type: "string",
          description: "The testbench code",
        },
        project_id: {
          type: "string",
          description: "Optional: existing project ID to use",
        },
        project_name: {
          type: "string",
          description: "Optional: name for new project",
        },
      },
      required: ["verilog_code", "testbench_code"],
    },
  },
  {
    name: "view_waveform",
    description:
      "Open VCD waveform file in GTKWave viewer. Accessible via VNC at http://localhost:8888",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID from simulation",
        },
        vcd_file: {
          type: "string",
          description: "VCD filename (default: output.vcd)",
          default: "output.vcd",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_openlane",
    description:
      "Run complete ASIC design flow using OpenLane (RTL to GDSII) in Docker. This process can take up to 10 minutes.",
    inputSchema: {
      type: "object",
      properties: {
        verilog_code: {
          type: "string",
          description: "The Verilog RTL code for ASIC implementation (use this OR verilog_files)",
        },
        verilog_files: {
          type: "array",
          items: { type: "string" },
          description: "Array of Verilog file paths to use (use this OR verilog_code). Supports container paths like /workspace/projects/aes/*.v",
        },
        design_name: {
          type: "string",
          description: "Name of the design (will be used for module and files)",
        },
        clock_port: {
          type: "string",
          description: "Name of the clock port",
          default: "clk",
        },
        clock_period: {
          type: "number",
          description: "Clock period in nanoseconds",
          default: 10.0,
        },
        pdk: {
          type: "string",
          description: "Process Design Kit (sky130A, gf180mcuD, ihp-sg13g2)",
          default: "sky130A",
        },
        project_id: {
          type: "string",
          description: "Optional: existing project ID to use",
        },
      },
      required: ["design_name"],
    },
  },
  {
    name: "view_gds",
    description:
      "Open GDSII file in KLayout viewer. Accessible via VNC at http://localhost:8888",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID from OpenLane run",
        },
        gds_file: {
          type: "string",
          description: "Specific GDS filename (optional, auto-detected if not provided)",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "read_openlane_reports",
    description:
      "Read OpenLane report files for analysis. Returns PPA metrics, timing, and routing results.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID from OpenLane run",
        },
        report_type: {
          type: "string",
          description:
            "Specific report category (synthesis, placement, routing, signoff). Leave empty for all.",
          default: "",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "list_projects",
    description: "List all EDA projects with their details",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_project",
    description: "Get details of a specific project including runs and PPA metrics",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to retrieve",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "delete_project",
    description: "Delete a project and all its files",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to delete",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_vnc_info",
    description: "Get VNC connection information for accessing GUI tools",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_docker_status",
    description: "Check if the Docker container is running and available",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // RAG Tools
  {
    name: "search_eda_docs",
    description:
      "Search OpenLane and AutoTuner documentation using semantic search. Returns relevant documentation snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language query to search for",
        },
        doc_type: {
          type: "string",
          enum: ["openlane", "autotuner", "all"],
          description: "Filter by documentation type (default: all)",
          default: "all",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 5)",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_config_help",
    description:
      "Get help for OpenLane or AutoTuner configuration variables. Searches documentation for parameter explanations.",
    inputSchema: {
      type: "object",
      properties: {
        variable_name: {
          type: "string",
          description: "Name of the configuration variable (e.g., CLOCK_PERIOD, FP_CORE_UTIL)",
        },
      },
      required: ["variable_name"],
    },
  },
  {
    name: "explain_eda_error",
    description:
      "Explain EDA tool error messages and suggest solutions. Searches documentation for troubleshooting information.",
    inputSchema: {
      type: "object",
      properties: {
        error_message: {
          type: "string",
          description: "The error message to explain",
        },
      },
      required: ["error_message"],
    },
  },
  {
    name: "get_autotuner_help",
    description:
      "Get help for AutoTuner optimization parameters and objectives.",
    inputSchema: {
      type: "object",
      properties: {
        objective: {
          type: "string",
          description: "Optimization objective (e.g., timing, area, power)",
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "Optional constraints to consider",
        },
      },
      required: ["objective"],
    },
  },
  {
    name: "get_openlane_step_info",
    description:
      "Get information about a specific OpenLane flow step (synthesis, floorplan, placement, cts, routing, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        step_name: {
          type: "string",
          description: "Name of the OpenLane step",
        },
      },
      required: ["step_name"],
    },
  },
  {
    name: "get_eda_topic_help",
    description:
      "Get quick help on common EDA topics: getting_started, synthesis, placement, routing, signoff, autotuner, pdk",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["getting_started", "synthesis", "placement", "routing", "signoff", "autotuner", "pdk"],
          description: "The topic to get help on",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "check_rag_status",
    description:
      "Check if the RAG (documentation search) system is available and configured",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ==================== TUNER TOOLS ====================
  {
    name: "check_tuner_status",
    description: "Check if AutoTuner is available in the Docker container",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "suggest_tuning_params",
    description: "Analyze a completed OpenLane run and suggest tuning parameters for optimization",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to analyze",
        },
        goal: {
          type: "string",
          enum: ["timing", "area", "power", "balanced"],
          description: "Optimization goal",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_autotuner",
    description: "Run ORFS AutoTuner to optimize design parameters using Bayesian optimization. Sets up proper ORFS Makefile-based flow and executes AutoTuner. This can take 30+ minutes.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to tune",
        },
        design_name: {
          type: "string",
          description: "Design name (must match top module name)",
        },
        verilog_code: {
          type: "string",
          description: "Verilog RTL code (optional - will try to read from project)",
        },
        clock_port: {
          type: "string",
          description: "Clock port name",
          default: "clk",
        },
        clock_period: {
          type: "number",
          description: "Clock period in ns",
          default: 10.0,
        },
        platform: {
          type: "string",
          description: "Platform/PDK (sky130hd, sky130hs, gf180, asap7)",
          default: "sky130hd",
        },
        goal: {
          type: "string",
          enum: ["timing", "area", "power", "balanced"],
          description: "Optimization goal",
        },
        algorithm: {
          type: "string",
          enum: ["hyperopt", "ax", "optuna", "nevergrad", "random"],
          description: "Optimization algorithm (hyperopt recommended)",
          default: "hyperopt",
        },
        iterations: {
          type: "number",
          description: "Number of tuning iterations (samples)",
          default: 15,
        },
        timeout: {
          type: "number",
          description: "Timeout in minutes",
          default: 60,
        },
      },
      required: ["project_id", "design_name"],
    },
  },
  {
    name: "stop_autotuner",
    description: "Stop a running AutoTuner process",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_tuning_results",
    description: "Get results from a completed AutoTuner run",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "list_tunable_parameters",
    description: "List all available tunable parameters and optimization presets",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "quick_tuning_analysis",
    description: "Quick analysis of design to determine if tuning is needed",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to analyze",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_optimized_openlane",
    description: "Run LibreLane with optimized parameters from AutoTuner. Automatically applies best parameters found by AutoTuner and re-runs the flow with optimized configuration. This completes the optimization loop.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with existing LibreLane run to optimize",
        },
        best_parameters: {
          type: "object",
          description: "Best parameters from AutoTuner (ORFS format). Keys are parameter names like CORE_UTILIZATION, values are numbers.",
          additionalProperties: { type: "number" },
        },
        save_original_config: {
          type: "boolean",
          description: "Save backup of original config.json before applying optimizations",
          default: true,
        },
      },
      required: ["project_id", "best_parameters"],
    },
  },

  // ==================== SIGNOFF TOOLS ====================
  {
    name: "run_signoff_checks",
    description: "Run comprehensive signoff checks including DRC, LVS, Antenna, IR Drop, and Timing analysis",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
        checks: {
          type: "object",
          properties: {
            drc: { type: "boolean", default: true },
            lvs: { type: "boolean", default: true },
            antenna: { type: "boolean", default: true },
            irDrop: { type: "boolean", default: true },
            timing: { type: "boolean", default: true },
          },
          description: "Which checks to run",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_drc_check",
    description: "Run DRC (Design Rule Check) using Magic. Returns violations categorized by rule type.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_lvs_check",
    description: "Run LVS (Layout vs Schematic) check using Netgen",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_timing_signoff",
    description: "Run timing signoff analysis using OpenSTA. Reports WNS, TNS, and violation counts.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_ir_drop_analysis",
    description: "Run IR drop analysis. Reports worst-case voltage drop and hotspots.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
        max_ir_drop_mv: {
          type: "number",
          description: "Maximum allowed IR drop in mV",
          default: 50,
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_eco_optimization",
    description: "Run iterative ECO (Engineering Change Order) optimization to fix timing violations",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
        max_iterations: {
          type: "number",
          description: "Maximum optimization iterations",
          default: 10,
        },
        target_wns: {
          type: "number",
          description: "Target WNS to achieve (ns)",
          default: 0,
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "quick_timing_fix",
    description: "Perform a single-iteration timing fix. Quick way to improve timing.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
        fix_setup: {
          type: "boolean",
          description: "Fix setup violations",
          default: true,
        },
        fix_hold: {
          type: "boolean",
          description: "Fix hold violations",
          default: true,
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "analyze_timing_violations",
    description: "Analyze current timing violations and get detailed path information",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "run_tapeout_checklist",
    description: "Run comprehensive tapeout checklist with GDS readiness scoring",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
        requirements: {
          type: "object",
          properties: {
            min_density: { type: "number" },
            max_density: { type: "number" },
            target_frequency: { type: "number" },
            max_power: { type: "number" },
            max_area: { type: "number" },
          },
          description: "Design requirements for validation",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "quick_readiness_check",
    description: "Quick check if design is ready for tapeout",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID with completed OpenLane run",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_algorithm_info",
    description: "Get information about available OpenROAD algorithms for optimization",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["all", "synthesis", "resizer", "placement", "cts", "global_routing", "detailed_routing", "timing", "signoff", "presets"],
          description: "Algorithm category to retrieve",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "get_optimization_preset",
    description: "Get predefined optimization preset for common goals",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["TIMING_CLOSURE", "LOW_POWER", "MIN_AREA", "DRC_CLEAN", "SIGNOFF_READY"],
          description: "Optimization preset name",
        },
      },
      required: ["preset"],
    },
  },
  {
    name: "estimate_timing_closure",
    description: "Estimate difficulty and effort required for timing closure",
    inputSchema: {
      type: "object",
      properties: {
        wns: {
          type: "number",
          description: "Worst Negative Slack in ns",
        },
        tns: {
          type: "number",
          description: "Total Negative Slack in ns",
        },
        cell_count: {
          type: "number",
          description: "Number of cells in design",
        },
      },
      required: ["wns", "tns", "cell_count"],
    },
  },
];

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Synthesis
      case "synthesize_verilog": {
        const verilogCode = getStringProperty(args, "verilog_code");
        const verilogFiles = args && typeof args === "object" && "verilog_files" in args
          ? (args.verilog_files as string[] | undefined)
          : undefined;
        const topModule = validateRequiredString(args, "top_module", name);
        const target = getStringProperty(args, "target", "generic") as
          | "generic"
          | "ice40"
          | "xilinx"
          | "sky130";
        const projectId = getStringProperty(args, "project_id");
        const projectName = getStringProperty(args, "project_name");

        // Validate that either verilog_code or verilog_files is provided
        if (!verilogCode && (!verilogFiles || verilogFiles.length === 0)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Either 'verilog_code' or 'verilog_files' must be provided for tool 'synthesize_verilog'"
          );
        }

        const result = await synthesizeVerilog({
          verilogCode: verilogCode || undefined,
          verilogFiles: verilogFiles || undefined,
          topModule,
          target,
          projectId: projectId || undefined,
          projectName: projectName || undefined,
        });

        return {
          content: [{ type: "text", text: formatSynthesisResult(result) }],
        };
      }

      // Simulation
      case "simulate_verilog": {
        const verilogCode = validateRequiredString(args, "verilog_code", name);
        const testbenchCode = validateRequiredString(args, "testbench_code", name);
        const projectId = getStringProperty(args, "project_id");
        const projectName = getStringProperty(args, "project_name");

        const result = await simulateVerilog({
          verilogCode,
          testbenchCode,
          projectId: projectId || undefined,
          projectName: projectName || undefined,
        });

        return {
          content: [{ type: "text", text: formatSimulationResult(result) }],
        };
      }

      // View waveform
      case "view_waveform": {
        const projectId = validateRequiredString(args, "project_id", name);
        const vcdFile = getStringProperty(args, "vcd_file", "output.vcd");

        const result = await viewWaveform(projectId, vcdFile);

        return {
          content: [{ type: "text", text: formatViewerResult(result) }],
        };
      }

      // OpenLane
      case "run_openlane": {
        const verilogCode = getStringProperty(args, "verilog_code");
        const verilogFiles = getArrayProperty(args, "verilog_files");
        const designName = validateRequiredString(args, "design_name", name);
        const clockPort = getStringProperty(args, "clock_port", "clk");
        const clockPeriod = getNumberProperty(args, "clock_period", 10.0);
        const pdk = getStringProperty(args, "pdk", "sky130A") as
          | "sky130A"
          | "gf180mcuD"
          | "ihp-sg13g2";
        const projectId = getStringProperty(args, "project_id");

        const result = await runOpenlane({
          verilogCode: verilogCode || undefined,
          verilogFiles: verilogFiles || undefined,
          designName,
          clockPort,
          clockPeriod,
          pdk,
          projectId: projectId || undefined,
        });

        return {
          content: [{ type: "text", text: formatOpenlaneResult(result) }],
        };
      }

      // View GDS
      case "view_gds": {
        const projectId = validateRequiredString(args, "project_id", name);
        const gdsFile = getStringProperty(args, "gds_file");

        const result = await viewGds(projectId, gdsFile || undefined);

        return {
          content: [{ type: "text", text: formatViewerResult(result) }],
        };
      }

      // Read reports
      case "read_openlane_reports": {
        const projectId = validateRequiredString(args, "project_id", name);
        const reportType = getStringProperty(args, "report_type");

        const result = await readOpenlaneReports(projectId, reportType || undefined);

        return {
          content: [{ type: "text", text: formatReportsResult(result) }],
        };
      }

      // List projects
      case "list_projects": {
        const projects = projectManager.getAllProjectsWithDetails();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  count: projects.length,
                  projects: projects.map((p) => ({
                    id: p.id,
                    name: p.name,
                    design_name: p.designName,
                    top_module: p.topModule,
                    runs: p.runs.length,
                    files: p.files.length,
                    latest_ppa: p.latestPPA,
                    created_at: p.createdAt.toISOString(),
                    updated_at: p.updatedAt.toISOString(),
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Get project
      case "get_project": {
        const projectId = validateRequiredString(args, "project_id", name);
        const project = projectManager.getProjectWithDetails(projectId);

        if (!project) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { success: false, error: `Project ${projectId} not found` },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const summary = projectManager.getProjectSummary(projectId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  project: {
                    ...project,
                    created_at: project.createdAt.toISOString(),
                    updated_at: project.updatedAt.toISOString(),
                  },
                  summary,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Delete project
      case "delete_project": {
        const projectId = validateRequiredString(args, "project_id", name);
        const deleted = projectManager.deleteProject(projectId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: deleted,
                  message: deleted
                    ? `Project ${projectId} deleted`
                    : `Failed to delete project ${projectId}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Get VNC info
      case "get_vnc_info": {
        const vncInfo = getVncInfo();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  vnc: vncInfo,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Check Docker status
      case "check_docker_status": {
        const isAvailable = await dockerManager.isDockerAvailable();
        const status = await dockerManager.getContainerStatus();
        const toolVersions = status.running ? await dockerManager.getToolVersions() : {};

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  docker_available: isAvailable,
                  container_running: status.running,
                  container_status: status.status,
                  container_id: status.id,
                  tools: toolVersions,
                  vnc_url: status.running ? "http://localhost:8888" : undefined,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // RAG Tools
      case "search_eda_docs": {
        const query = validateRequiredString(args, "query", name);
        const docType = getStringProperty(args, "doc_type", "all") as "openlane" | "autotuner" | "all";
        const limit = getNumberProperty(args, "limit", 5);

        const result = await searchEDADocs(query, { limit, docType });

        if (!result.success) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: formatRAGResult(result.result!) }],
        };
      }

      case "get_config_help": {
        const variableName = validateRequiredString(args, "variable_name", name);

        const result = await getConfigHelp(variableName);

        if (!result.success) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: formatRAGResult(result.result!) }],
        };
      }

      case "explain_eda_error": {
        const errorMessage = validateRequiredString(args, "error_message", name);

        const result = await explainError(errorMessage);

        if (!result.success) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: formatRAGResult(result.result!) }],
        };
      }

      case "get_autotuner_help": {
        const objective = validateRequiredString(args, "objective", name);
        const constraints = args && typeof args === "object" && "constraints" in args
          ? (args.constraints as string[] | undefined)
          : undefined;

        const result = await getAutoTunerHelp(objective, constraints);

        if (!result.success) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: formatRAGResult(result.result!) }],
        };
      }

      case "get_openlane_step_info": {
        const stepName = validateRequiredString(args, "step_name", name);

        const result = await getStepInfo(stepName);

        if (!result.success) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: formatRAGResult(result.result!) }],
        };
      }

      case "get_eda_topic_help": {
        const topic = validateRequiredString(args, "topic", name) as
          | "getting_started" | "synthesis" | "placement" | "routing" | "signoff" | "autotuner" | "pdk";

        const result = await getTopicHelp(topic);

        if (!result.success) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: formatRAGResult(result.result!) }],
        };
      }

      case "check_rag_status": {
        const ragStatus = await checkRAGStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  rag_available: ragStatus.available,
                  openai_configured: ragStatus.openaiConfigured,
                  vectorstore_available: ragStatus.vectorstoreAvailable,
                  document_count: ragStatus.documentCount,
                  doc_types: ragStatus.docTypes,
                  sources: ragStatus.sources,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ==================== TUNER TOOL HANDLERS ====================
      case "check_tuner_status": {
        const result = await checkTunerStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "suggest_tuning_params": {
        const projectId = validateRequiredString(args, "project_id", name);
        const goal = getStringProperty(args, "goal", "balanced") as "balanced" | "performance" | "low_power" | "min_area";
        const paths = projectManager.getProjectPaths(projectId);

        const result = await suggestTuningParams(paths.containerPath, { goal });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_autotuner": {
        const projectId = validateRequiredString(args, "project_id", name);
        const designName = validateRequiredString(args, "design_name", name);
        const verilogCode = getStringProperty(args, "verilog_code");
        const clockPort = getStringProperty(args, "clock_port", "clk");
        const clockPeriod = getNumberProperty(args, "clock_period", 10.0);
        const platform = getStringProperty(args, "platform", "sky130hd");
        const goal = getStringProperty(args, "goal", "balanced") as "balanced" | "performance" | "low_power" | "min_area";
        const algorithm = getStringProperty(args, "algorithm", "hyperopt") as "hyperopt" | "ax" | "optuna" | "nevergrad" | "random";
        const iterations = getNumberProperty(args, "iterations", 15);
        const timeout = getNumberProperty(args, "timeout", 60);
        const paths = projectManager.getProjectPaths(projectId);

        const result = await runAutoTunerTool({
          projectDir: paths.containerPath,
          designName,
          platform,
          goal,
          algorithm,
          iterations,
          timeout,
          verilogCode: verilogCode || undefined,
          clockPort,
          clockPeriod,
        });

        return {
          content: [{ type: "text", text: result.result ? formatTunerResults(result.result) : JSON.stringify(result, null, 2) }],
        };
      }

      case "stop_autotuner": {
        const result = await stopAutoTunerTool();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_tuning_results": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);

        const result = await getTuningResults(paths.containerPath);
        return {
          content: [{ type: "text", text: result.result ? formatTunerResults(result.result) : JSON.stringify(result, null, 2) }],
        };
      }

      case "list_tunable_parameters": {
        const result = listTunableParameters();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "quick_tuning_analysis": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);

        const result = await quickTuningAnalysis(paths.containerPath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_optimized_openlane": {
        const projectId = validateRequiredString(args, "project_id", name);
        const bestParameters = args && typeof args === "object" && "best_parameters" in args
          ? (args.best_parameters as Record<string, number>)
          : undefined;
        const saveOriginalConfig = getBooleanProperty(args, "save_original_config", true);

        if (!bestParameters || Object.keys(bestParameters).length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Missing required parameter 'best_parameters' - provide ORFS format parameters from AutoTuner"
              }, null, 2)
            }],
          };
        }

        const result = await runOptimizedOpenlaneTool({
          projectId,
          bestParameters,
          saveOriginalConfig,
        });

        return {
          content: [{ type: "text", text: formatOptimizedRunResult(result) }],
        };
      }

      // ==================== SIGNOFF TOOL HANDLERS ====================
      case "run_signoff_checks": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const project = projectManager.getProject(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;
        const gdsFile = `${project?.designName || "design"}.gds`;
        const netlistFile = `${project?.designName || "design"}.nl.v`;

        const result = await signoffToolHandlers.run_signoff_checks({
          runDir,
          gdsFile,
          netlistFile,
          platform: "sky130hd",
          checks: args && typeof args === "object" && "checks" in args ? args.checks : undefined,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_drc_check": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const project = projectManager.getProject(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;
        const gdsFile = `${project?.designName || "design"}.gds`;

        const result = await signoffToolHandlers.run_drc_check({
          runDir,
          gdsFile,
          platform: "sky130hd",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_lvs_check": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const project = projectManager.getProject(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;
        const gdsFile = `${project?.designName || "design"}.gds`;
        const netlistFile = `${project?.designName || "design"}.nl.v`;

        const result = await signoffToolHandlers.run_lvs_check({
          runDir,
          gdsFile,
          netlistFile,
          platform: "sky130hd",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_timing_signoff": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.run_timing_signoff({
          runDir,
          platform: "sky130hd",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_ir_drop_analysis": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);
        const maxIrDropMv = getNumberProperty(args, "max_ir_drop_mv", 50);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.run_ir_drop_analysis({
          runDir,
          platform: "sky130hd",
          maxIRDropMv: maxIrDropMv,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_eco_optimization": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);
        const maxIterations = getNumberProperty(args, "max_iterations", 10);
        const targetWns = getNumberProperty(args, "target_wns", 0);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.run_eco_optimization({
          runDir,
          platform: "sky130hd",
          maxIterations,
          targetWNS: targetWns,
          setupMargin: 0.1,
          holdMargin: 0.05,
          maxUtilization: 90,
          enableBufferInsertion: true,
          enableGateSizing: true,
          enableVTSwap: true,
          enablePinSwap: true,
          stopOnConvergence: true,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "quick_timing_fix": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);
        const fixSetup = getBooleanProperty(args, "fix_setup", true);
        const fixHold = getBooleanProperty(args, "fix_hold", true);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.quick_timing_fix({
          runDir,
          platform: "sky130hd",
          fixSetup,
          fixHold,
          margin: 0.1,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "analyze_timing_violations": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.analyze_timing_violations({
          runDir,
          platform: "sky130hd",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "run_tapeout_checklist": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const project = projectManager.getProject(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.run_tapeout_checklist({
          runDir,
          platform: "sky130hd",
          design: project?.designName || "design",
          requirements: args && typeof args === "object" && "requirements" in args ? args.requirements : undefined,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "quick_readiness_check": {
        const projectId = validateRequiredString(args, "project_id", name);
        const paths = projectManager.getProjectPaths(projectId);
        const project = projectManager.getProject(projectId);
        const { latestRun } = await findLatestRunForProject(projectId);

        if (!latestRun) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "No OpenLane run found" }, null, 2) }],
          };
        }

        const runDir = `${paths.containerPath}/runs/${latestRun}`;

        const result = await signoffToolHandlers.quick_readiness_check({
          runDir,
          design: project?.designName || "design",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_algorithm_info": {
        const category = validateRequiredString(args, "category", name);

        const result = await signoffToolHandlers.get_algorithm_info({
          category,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_optimization_preset": {
        const preset = validateRequiredString(args, "preset", name);

        const result = await signoffToolHandlers.get_optimization_preset({
          preset,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "estimate_timing_closure": {
        const wns = getNumberProperty(args, "wns", 0);
        const tns = getNumberProperty(args, "tns", 0);
        const cellCount = getNumberProperty(args, "cell_count", 1000);

        const result = await signoffToolHandlers.estimate_timing_closure({
          wns,
          tns,
          cellCount,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup info to stderr (not visible to MCP client but helpful for debugging)
  console.error("=== MCP4EDA Server v2.0.0 ===");
  console.error("Features:");
  console.error("  - Verilog Synthesis (Yosys)");
  console.error("  - Verilog Simulation (Icarus Verilog)");
  console.error("  - ASIC Flow (OpenLane)");
  console.error("  - Waveform Viewer (GTKWave via VNC)");
  console.error("  - Layout Viewer (KLayout via VNC)");
  console.error("  - Documentation RAG (OpenLane + AutoTuner)");
  console.error("");
  console.error("VNC Access: http://localhost:8888 (password: abc123)");
  console.error("RAG: Requires OPENAI_API_KEY and ChromaDB on port 8000");
  console.error("================================");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
