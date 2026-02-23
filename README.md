# Agent4EDA (MCP4EDA v2)

**End-to-end AI-powered ASIC design automation: RTL to GDSII to Tapeout**

[![MCP4EDA Paper](https://img.shields.io/badge/MCP4EDA_Paper-arXiv:2507.19570-b31b1b.svg)](https://arxiv.org/abs/2507.19570)
[![MCP4EDA Repo](https://img.shields.io/badge/MCP4EDA_Repo-NellyW8/mcp--EDA-lightgrey.svg)](https://github.com/NellyW8/mcp-EDA)
[![MCP4EDA Website](https://img.shields.io/badge/MCP4EDA_Website-agent4eda.com-blue)](http://www.agent4eda.com/)

> Built on top of [MCP4EDA](https://github.com/NellyW8/mcp-EDA), which provided 6 basic MCP tools with local tool installation. Agent4EDA extends it into a **fully containerized, end-to-end solution** with **Docker-based architecture**, **AutoTuner PPA optimization**, **DFT/signoff verification**, **ECO timing closure**, and **tapeout readiness scoring** — growing the toolset from 6 to **39 MCP tools**.

Agent4EDA is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI assistants (Claude Desktop, Cursor IDE) full control over a professional EDA toolchain running inside Docker. Ask your AI to synthesize, simulate, place-and-route, optimize, verify, and tape out your chip designs — all through natural language.

- [**MCP4EDA Website**](http://www.agent4eda.com/) | [**MCP4EDA Paper**](https://arxiv.org/abs/2507.19570)

## Demo (from original MCP4EDA)

https://github.com/user-attachments/assets/65d8027e-7366-49b5-8f11-0430c1d1d3d6

*Demo from the original [MCP4EDA project](https://github.com/NellyW8/mcp-EDA) showing Verilog synthesis, simulation, and ASIC design flow*

---

## What's New (Agent4EDA vs MCP4EDA)

The original [MCP4EDA](https://github.com/NellyW8/mcp-EDA) required users to install each EDA tool locally on their machine and provided 6 basic tools. Agent4EDA re-architects the entire system around **Docker containers**, adds full **signoff/tapeout verification**, and introduces **AI-driven PPA optimization** — making it a true end-to-end solution.

| Capability | MCP4EDA (Original) | Agent4EDA (This Repo) |
|---|---|---|
| Tools | 6 basic tools | **39 MCP tools** |
| Architecture | Local tool install (no containers) | **Fully containerized** (IIC-OSIC-TOOLS Docker) |
| Setup | Install Yosys, iverilog, OpenLane, etc. individually | **Single `docker-compose up`** — all tools included |
| PPA Optimization | Manual parameter tuning | **AutoTuner** with Bayesian optimization (5 algorithms) |
| Signoff | Not implemented | **DRC, LVS, Timing, IR Drop, Antenna** checks |
| Timing Closure | Not implemented | **ECO iterative optimization** (buffer insertion, gate sizing, Vt swap) |
| Tapeout Readiness | Not implemented | **25+ point checklist with A-F grading** |
| Documentation | Manual lookup | **RAG semantic search** (700+ indexed chunks) |
| Project Persistence | Temp files | **SQLite database** with PPA history tracking |
| GUI Access | Local apps required | **VNC in browser** (http://localhost:8888) |
| Reproducibility | Depends on local environment | **Deterministic** — same container everywhere |

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│              Claude Desktop / Cursor IDE                │
│          "Synthesize this counter for sky130"           │
└──────────────────────┬─────────────────────────────────┘
                       │ MCP Protocol (stdio)
                       ▼
┌────────────────────────────────────────────────────────┐
│              Agent4EDA MCP Server (Node.js)             │
│                                                         │
│  39 Tools: synthesis, simulation, openlane, autotuner, │
│  signoff, ECO, tapeout, RAG search, project mgmt       │
│                                                         │
│  Modules: DockerManager | ProjectManager | Database    │
│           RAG System | AutoTuner | SignoffChecker       │
└──────┬──────────────────┬──────────────────┬───────────┘
       │ docker exec      │ HTTP :8000       │ SQLite
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ EDA Container│  │   ChromaDB   │  │   mcp4eda.db     │
│ (IIC-OSIC)   │  │ Vector Store │  │                  │
│              │  │              │  │ projects, runs,  │
│ Yosys        │  │ 700+ doc    │  │ files, ppa_metrics│
│ Icarus       │  │ embeddings  │  └──────────────────┘
│ OpenLane     │  └──────────────┘
│ OpenROAD     │
│ Magic/Netgen │
│ KLayout      │
│ AutoTuner    │
│ VNC :8888    │
└──────────────┘
```

---

## Features & Tools (39 Total)

### Synthesis & Simulation
| Tool | Description |
|------|-------------|
| `synthesize_verilog` | Synthesize RTL using Yosys (targets: generic, ice40, xilinx, sky130) |
| `simulate_verilog` | Simulate with Icarus Verilog, generates VCD waveforms |

### ASIC Design Flow (RTL-to-GDSII)
| Tool | Description |
|------|-------------|
| `run_openlane` | Complete RTL-to-GDSII flow using OpenLane (sky130A, gf180mcuD, ihp-sg13g2) |
| `run_optimized_openlane` | Run with AutoTuner-optimized parameters |
| `read_openlane_reports` | Parse synthesis/placement/routing/signoff reports |

### AutoTuner (PPA Optimization)
| Tool | Description |
|------|-------------|
| `suggest_tuning_params` | AI analyzes design metrics and suggests optimal parameter ranges |
| `generate_tuner_config` | Generate OpenROAD AutoTuner configuration |
| `run_autotuner` | Execute Bayesian optimization (Hyperopt, Ax, Optuna, Nevergrad) |
| `stop_autotuner` | Halt a running optimization |
| `get_tuning_results` | Retrieve best configuration from completed tuning |
| `list_tunable_parameters` | List 20+ tunable parameters with ranges and presets |
| `quick_tuning_analysis` | Assess whether tuning would benefit a design |

### Signoff & Verification
| Tool | Description |
|------|-------------|
| `run_signoff_checks` | Run all 5 signoff checks in one call |
| `run_drc_check` | Design Rule Check via Magic |
| `run_lvs_check` | Layout vs Schematic via Netgen |
| `run_timing_signoff` | Static timing analysis via OpenSTA |
| `run_ir_drop_analysis` | Power integrity analysis via PDNSim |

### ECO Timing Closure
| Tool | Description |
|------|-------------|
| `run_eco_optimization` | Iterative timing closure (buffer insertion, gate sizing, Vt swap) |
| `quick_timing_fix` | Single-pass timing repair |
| `analyze_timing_violations` | Detailed violation path analysis |
| `estimate_timing_closure` | Predict iterations needed with difficulty scoring |

### Tapeout Readiness
| Tool | Description |
|------|-------------|
| `run_tapeout_checklist` | 25+ point checklist with GDS readiness score (0-100, A-F grade) |
| `quick_readiness_check` | Fast critical-file verification |
| `get_algorithm_info` | Browse 100+ OpenROAD algorithms |
| `get_optimization_preset` | Get predefined configs (timing_closure, low_power, min_area, etc.) |
| `recommend_search_algorithm` | Get AutoTuner algorithm recommendation for your design |

### Visualization
| Tool | Description |
|------|-------------|
| `view_waveform` | Open VCD in GTKWave via VNC browser |
| `view_gds` | Open GDSII in KLayout via VNC browser |

### Documentation RAG Search
| Tool | Description |
|------|-------------|
| `search_eda_docs` | Semantic search across 700+ documentation chunks |
| `get_config_help` | Get help for any OpenLane/ORFS config variable |
| `explain_eda_error` | Troubleshoot EDA error messages |
| `get_autotuner_help` | AutoTuner parameter and optimization guidance |
| `get_openlane_step_info` | Detailed info about any flow step |
| `get_eda_topic_help` | Quick topic overviews (7 standard topics) |
| `check_rag_status` | RAG system health check |

### Project Management
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects with metadata |
| `get_project` | Get project details (runs, files, PPA history) |
| `delete_project` | Delete project and all associated files |
| `check_docker_status` | Container status, tool versions, VNC availability |
| `get_vnc_info` | Get VNC connection details |

---

## Quick Start

### Prerequisites
- **Docker Desktop 4.39.0+** with Docker Compose
- **Node.js 18+**
- **OpenAI API key** (for RAG documentation search — optional)

### 1. Clone & Build

```bash
git clone https://github.com/NellyW8/mcp-EDA.git
cd mcp-EDA
npm install
npm run build
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set your OpenAI API key (optional, for RAG):
# OPENAI_API_KEY=sk-proj-...
```

### 3. Start Docker Containers

```bash
docker-compose -f docker/docker-compose.yml up -d
```

This starts:
- **mcp4eda** container — All EDA tools + VNC server
- **chromadb** container — Vector database for documentation search

Verify:
```bash
docker exec mcp4eda yosys --version
docker exec mcp4eda iverilog -V
```

### 4. Connect to Claude Desktop

Edit your Claude Desktop config:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "eda-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-EDA/build/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
        "HOME": "/your/home/directory"
      }
    }
  }
}
```

Restart Claude Desktop. You should see 39 tools available in the MCP tools menu.

### 5. (Optional) Connect via Docker Desktop MCP Extension

For the easiest setup:
1. Install "Labs: AI Tools for Devs" extension in Docker Desktop
2. Click gear icon > "MCP Clients" tab > Connect to Claude Desktop

This auto-configures the Docker MCP bridge:
```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "alpine/socat", "STDIO", "TCP:host.docker.internal:8811"]
    }
  }
}
```

### Cursor IDE Setup

1. `Ctrl+Shift+P` > "Cursor Settings" > MCP
2. Add MCP server with the same configuration as Claude Desktop above
3. Enable the "eda-mcp" server

---

## Usage Examples

### 1. Synthesize Verilog

```
"Synthesize this counter for ice40 FPGA"

module counter(
    input clk, input rst,
    output reg [7:0] count
);
    always @(posedge clk or posedge rst)
        if (rst) count <= 0;
        else count <= count + 1;
endmodule
```

### 2. Simulate with Testbench

```
"Simulate this adder with a testbench"

module adder(input [3:0] a, b, output [4:0] sum);
    assign sum = a + b;
endmodule
```

### 3. Full ASIC Flow (RTL-to-GDSII)

```
"Run the complete ASIC flow for this design on sky130 with a 10ns clock"
```

Produces: GDSII layout, timing/power/area reports, DEF files, netlists

### 4. Optimize PPA with AutoTuner

```
"The timing is failing. Can you tune the design parameters to close timing?"
```

The AI will:
1. Analyze current PPA metrics
2. Suggest parameter ranges
3. Run Bayesian optimization (15-30 iterations)
4. Apply the best configuration

### 5. Run Signoff Checks

```
"Run all signoff checks on my design"
```

Runs DRC, LVS, timing, IR drop, and antenna checks in one call.

### 6. Check Tapeout Readiness

```
"Is my design ready for tapeout?"
```

Returns a 25+ point checklist with a readiness score (0-100) and letter grade (A-F).

### 7. ECO Timing Closure

```
"Fix the timing violations in my design"
```

Iteratively applies buffer insertion, gate sizing, and Vt swapping until timing closes.

### 8. Search Documentation

```
"How do I configure clock tree synthesis in OpenLane?"
```

Semantically searches 700+ indexed documentation chunks and returns relevant answers.

### 9. View Results in Browser

```
"Show me the GDS layout" or "View the simulation waveforms"
```

Opens GTKWave/KLayout in your browser via VNC at http://localhost:8888

---

## Project Structure

```
mcp-EDA/
├── src/
│   ├── index.ts                 # Main MCP server (39 tool handlers)
│   ├── db/
│   │   ├── database.ts          # SQLite operations
│   │   └── schema.sql           # Database schema
│   ├── docker/
│   │   ├── docker-manager.ts    # Container lifecycle
│   │   └── commands.ts          # Docker command wrappers
│   ├── files/
│   │   ├── file-manager.ts      # File I/O
│   │   ├── project-manager.ts   # Project CRUD
│   │   ├── path-resolver.ts     # Host <-> container path mapping
│   │   └── cleanup.ts           # Cleanup utilities
│   ├── tools/
│   │   ├── synthesis.ts         # Yosys synthesis
│   │   ├── simulation.ts        # Icarus Verilog simulation
│   │   ├── openlane.ts          # OpenLane RTL-to-GDSII
│   │   ├── viewers.ts           # GTKWave & KLayout via VNC
│   │   ├── rag-tools.ts         # Documentation search tools
│   │   ├── tuner-tools.ts       # AutoTuner optimization tools
│   │   └── signoff-tools.ts     # Signoff & tapeout tools
│   ├── rag/
│   │   ├── embeddings.ts        # OpenAI embedding generation
│   │   ├── vectorstore.ts       # ChromaDB operations
│   │   ├── doc-loader.ts        # Documentation ingestion
│   │   └── search.ts            # Semantic search interface
│   ├── tuner/
│   │   ├── config-generator.ts  # AutoTuner config generation
│   │   ├── metrics-extractor.ts # PPA metrics parsing
│   │   ├── ai-suggestions.ts    # AI-based parameter suggestions
│   │   ├── autotuner-runner.ts  # ORFS AutoTuner execution
│   │   ├── parameter-mapping.ts # ORFS parameter mapping
│   │   └── orfs-setup.ts        # OpenROAD Flow Scripts setup
│   ├── signoff/
│   │   ├── signoff-checker.ts   # DRC, LVS, timing, IR drop, antenna
│   │   ├── eco-optimizer.ts     # ECO timing closure loop
│   │   ├── tapeout-checklist.ts # 25+ point tapeout readiness
│   │   ├── algorithms.ts        # 100+ OpenROAD algorithm catalog
│   │   └── autotuner-algorithms.ts  # Search algorithm definitions
│   └── types/
│       └── project.ts           # TypeScript interfaces
├── docker/
│   ├── Dockerfile               # Extended IIC-OSIC-TOOLS image
│   └── docker-compose.yml       # Multi-container orchestration
├── scripts/
│   ├── ingest-docs.ts           # One-time RAG ingestion
│   ├── health-check.sh          # Tool availability check
│   └── view-chromadb.ts         # ChromaDB inspection
├── projects/                    # User projects (volume mount)
├── .env.example                 # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Design Flow

Agent4EDA supports the complete ASIC design pipeline:

```
         RTL Design (Verilog)
              │
              ▼
    ┌─────────────────────┐
    │  1. SYNTHESIS        │  synthesize_verilog
    │     Yosys            │  (generic, ice40, xilinx, sky130)
    └─────────┬───────────┘
              ▼
    ┌─────────────────────┐
    │  2. SIMULATION       │  simulate_verilog
    │     Icarus Verilog   │  → VCD waveforms
    └─────────┬───────────┘
              ▼
    ┌─────────────────────┐
    │  3. ASIC FLOW        │  run_openlane
    │     OpenLane/OpenROAD│  → GDSII + reports
    └─────────┬───────────┘
              ▼
    ┌─────────────────────┐
    │  4. PPA OPTIMIZATION │  run_autotuner
    │     AutoTuner        │  Bayesian optimization
    │     (15-30 iters)    │  → Best config
    └─────────┬───────────┘
              ▼
    ┌─────────────────────┐
    │  5. SIGNOFF          │  run_signoff_checks
    │     DRC (Magic)      │
    │     LVS (Netgen)     │
    │     Timing (OpenSTA) │
    │     IR Drop (PDNSim) │
    └─────────┬───────────┘
              ▼
    ┌─────────────────────┐
    │  6. ECO CLOSURE      │  run_eco_optimization
    │     Buffer insertion │
    │     Gate sizing      │
    │     Vt swapping      │
    └─────────┬───────────┘
              ▼
    ┌─────────────────────┐
    │  7. TAPEOUT          │  run_tapeout_checklist
    │     25+ checks       │
    │     Readiness score  │
    │     A-F grade        │
    └─────────────────────┘
```

---

## AutoTuner Details

### Tunable Parameters (20+)

| Parameter | Range | Category |
|-----------|-------|----------|
| `CLOCK_PERIOD` | 5-20 ns | Timing |
| `FP_CORE_UTIL` | 30-80% | Area |
| `SYNTH_STRATEGY` | area/delay/mixed | Synthesis |
| `PLACEMENT_DENSITY` | 0.5-0.9 | Placement |
| `ROUTING_STRATEGY` | 0-14 | Routing |
| `ROUTING_LAYER_ADJUST` | 0-2 | Routing |
| + 14 more... | | |

### Search Algorithms

| Algorithm | Type | Iterations | Best For |
|-----------|------|------------|----------|
| **Hyperopt** | Bayesian (TPE) | ~15 | General use (recommended) |
| **Ax** | Adaptive | ~20 | Large design spaces |
| **Optuna** | TPE Sampler | ~15-20 | Similar to Hyperopt |
| **Nevergrad** | Evolutionary | ~25 | Multimodal landscapes |
| **Random** | Baseline | Any | Validation |

### Optimization Presets

| Preset | Focus | Iterations |
|--------|-------|------------|
| `TIMING_CLOSURE` | Fix timing violations | 30 |
| `LOW_POWER` | Minimize power | 25 |
| `MIN_AREA` | Minimize die area | 20 |
| `DRC_CLEAN` | Fix DRC violations | 15 |
| `SIGNOFF_READY` | Balance all metrics | 25 |

---

## Tapeout Readiness Scoring

The `run_tapeout_checklist` tool evaluates 25+ items across 5 categories:

| Category | Points | Checks |
|----------|--------|--------|
| Design Files | 20 | GDS, netlist, LEF/DEF present and valid |
| DRC/LVS | 30 | Zero errors in Magic DRC, Netgen LVS |
| Timing | 25 | WNS >= 0, TNS >= 0, no violations |
| Power | 15 | Within spec, no hotspots |
| Physical | 10 | Antenna, IR drop, slew clean |

**Grades:** A (90-100) | B (80-89) | C (70-79) | D (60-69) | F (<60)

---

## Docker Stack

### Containers

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| `mcp4eda` | mcp4eda:latest (IIC-OSIC-TOOLS) | 8888 (VNC), 5901 | All EDA tools |
| `chromadb` | chromadb/chroma:latest | 8000 | Vector database |

### Included EDA Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Yosys | 0.57 | RTL synthesis |
| Icarus Verilog | 13.0 | Simulation |
| OpenROAD | v2.0 | Place & route |
| OpenLane | Latest | RTL-to-GDSII flow |
| Magic | 8.3 | DRC, layout editing |
| Netgen | Latest | LVS verification |
| KLayout | Latest | Layout viewer |
| OpenSTA | Latest | Static timing analysis |
| AutoTuner (ORFS) | Latest | PPA optimization |

### Supported PDKs

- **sky130A** (SkyWater 130nm) - default
- **gf180mcuD** (GlobalFoundries 180nm)
- **ihp-sg13g2** (IHP 130nm SiGe BiCMOS)

---

## Database Schema

SQLite database (`mcp4eda.db`) with 4 tables:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `projects` | Project metadata | id, name, design_name, top_module |
| `runs` | Execution history | project_id, run_type, status, config, results |
| `files` | Generated artifacts | project_id, run_id, file_type, file_path |
| `ppa_metrics` | PPA tracking | run_id, area_um2, power_mw, frequency_mhz, wns_ns, tns_ns |

---

## RAG Documentation Search

The RAG system indexes 700+ documentation chunks from:
- OpenLane 2 documentation
- OpenROAD documentation
- OpenROAD-flow-scripts (ORFS) guides
- AutoTuner configuration references

### One-time Ingestion

```bash
# Requires OPENAI_API_KEY in .env
npx tsx scripts/ingest-docs.ts
```

Uses OpenAI `text-embedding-3-small` (1536-dim) embeddings stored in ChromaDB.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | For RAG | — | OpenAI API key for embeddings |
| `CHROMA_HOST` | No | localhost | ChromaDB host |
| `CHROMA_PORT` | No | 8000 | ChromaDB port |
| `DOCKER_CONTAINER_NAME` | No | mcp4eda | Docker container name |
| `MCP4EDA_PROJECTS_DIR` | No | ./projects | Projects directory |
| `MCP4EDA_DB_PATH` | No | ./mcp4eda.db | SQLite database path |

---

## Troubleshooting

### Docker Issues

```bash
# Check container status
docker ps -a | grep mcp4eda

# View container logs
docker logs mcp4eda

# Verify tools
docker exec mcp4eda yosys --version
docker exec mcp4eda iverilog -V
docker exec mcp4eda openroad -version

# Restart containers
docker-compose -f docker/docker-compose.yml restart
```

### MCP Connection Issues

1. Verify the absolute path in Claude Desktop config
2. Ensure Node.js 18+ is installed: `node --version`
3. Check MCP logs: Settings > Developer > Show Logs (Claude Desktop)
4. Restart Claude Desktop after config changes

### Docker Permission Errors (Linux)

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

### OpenLane Timeout

The server has a 10-minute timeout for OpenLane flows. For complex designs, the AI will automatically suggest parameter adjustments or design simplifications.

### VNC Not Loading

- Ensure port 8888 is not in use: `lsof -i :8888`
- Check VNC status: `docker exec mcp4eda ps aux | grep vnc`
- Access directly: http://localhost:8888 (password: abc123)

---

## Development

```bash
# Install dependencies
npm install

# Build (TypeScript -> JavaScript)
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev

# Run directly
npm start
```

---

## Contributing

Contributions are welcome. Key areas for improvement:

- Additional PDK support
- More synthesis targets
- Enhanced error recovery
- Performance benchmarking
- Integration test coverage
- Additional documentation sources for RAG

---

## Acknowledgments

Agent4EDA is built on top of the original **MCP4EDA** project. We gratefully acknowledge the foundational work by the original authors:

- **Original Paper:** [MCP4EDA: LLM-Powered Model Context Protocol RTL-to-GDSII Automation with Backend Aware Synthesis Optimization](https://arxiv.org/abs/2507.19570)
- **Original Repository:** [NellyW8/mcp-EDA](https://github.com/NellyW8/mcp-EDA)
- **Original Authors:** Yiting Wang, Wanghao Ye, Yexiao He, Yiran Chen, Gang Qu, Ang Li

Agent4EDA extends their work by adding Docker containerization, AutoTuner PPA optimization, signoff/ECO verification, tapeout readiness scoring, and RAG-based documentation search.

## Cite

If you use this work, please cite the original MCP4EDA paper:

```bibtex
@misc{wang2025mcp4edallmpoweredmodelcontext,
      title={MCP4EDA: LLM-Powered Model Context Protocol RTL-to-GDSII Automation with Backend Aware Synthesis Optimization},
      author={Yiting Wang and Wanghao Ye and Yexiao He and Yiran Chen and Gang Qu and Ang Li},
      year={2025},
      eprint={2507.19570},
      archivePrefix={arXiv},
      primaryClass={cs.AR},
      url={https://arxiv.org/abs/2507.19570},
}
```
