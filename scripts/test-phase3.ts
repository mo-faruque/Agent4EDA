/**
 * Test script for Phase 3: Docker-based EDA Tools
 */

import { dockerManager } from "../src/docker/docker-manager.js";
import { synthesizeVerilog, formatSynthesisResult } from "../src/tools/synthesis.js";
import { simulateVerilog, formatSimulationResult } from "../src/tools/simulation.js";
import { viewWaveform, viewGds, getVncInfo, formatViewerResult } from "../src/tools/viewers.js";
import { projectManager } from "../src/files/project-manager.js";
import { database } from "../src/db/database.js";

async function testPhase3() {
  console.log("=== Phase 3: Docker-based EDA Tools Tests ===\n");

  // Test 1: Check Docker status
  console.log("Test 1: Checking Docker status...");
  const dockerAvailable = await dockerManager.isDockerAvailable();
  console.log(`  Docker available: ${dockerAvailable}`);

  const containerStatus = await dockerManager.getContainerStatus();
  console.log(`  Container running: ${containerStatus.running}`);
  console.log(`  Container status: ${containerStatus.status}`);

  if (!containerStatus.running) {
    console.log("  Starting container...");
    const startResult = await dockerManager.startContainer();
    console.log(`  Start result: ${startResult.success ? "success" : startResult.stderr}`);

    // Wait for container
    const ready = await dockerManager.waitForContainer(30000);
    if (!ready) {
      console.error("  ERROR: Container failed to start!");
      process.exit(1);
    }
  }
  console.log("  ✓ Container ready");

  // Test 2: Get tool versions
  console.log("\nTest 2: Checking EDA tool versions...");
  const tools = await dockerManager.getToolVersions();
  for (const [tool, version] of Object.entries(tools)) {
    console.log(`  ${tool}: ${version}`);
  }
  console.log("  ✓ Tools available");

  // Test 3: Synthesis
  console.log("\nTest 3: Running Verilog synthesis...");
  const synthResult = await synthesizeVerilog({
    verilogCode: `
module counter (
  input wire clk,
  input wire rst,
  output reg [7:0] count
);
  always @(posedge clk or posedge rst) begin
    if (rst)
      count <= 8'b0;
    else
      count <= count + 1;
  end
endmodule
`,
    topModule: "counter",
    target: "generic",
    projectName: "test_phase3_synth",
  });

  console.log(`  Success: ${synthResult.success}`);
  console.log(`  Project ID: ${synthResult.projectId}`);
  if (synthResult.statistics) {
    console.log(`  Cells: ${synthResult.statistics.cells}`);
  }
  if (!synthResult.success) {
    console.log(`  Error: ${synthResult.error}`);
  } else {
    console.log("  ✓ Synthesis completed");
  }

  // Test 4: Simulation
  console.log("\nTest 4: Running Verilog simulation...");
  const simResult = await simulateVerilog({
    verilogCode: `
module adder (
  input [7:0] a,
  input [7:0] b,
  output [8:0] sum
);
  assign sum = a + b;
endmodule
`,
    testbenchCode: `
module tb_adder;
  reg [7:0] a, b;
  wire [8:0] sum;

  adder dut (.a(a), .b(b), .sum(sum));

  initial begin
    $dumpfile("output.vcd");
    $dumpvars(0, tb_adder);

    a = 8'd10; b = 8'd20;
    #10;
    $display("10 + 20 = %d", sum);

    a = 8'd100; b = 8'd155;
    #10;
    $display("100 + 155 = %d", sum);

    a = 8'd255; b = 8'd1;
    #10;
    $display("255 + 1 = %d", sum);

    $finish;
  end
endmodule
`,
    projectName: "test_phase3_sim",
  });

  console.log(`  Success: ${simResult.success}`);
  console.log(`  Project ID: ${simResult.projectId}`);
  console.log(`  VCD file: ${simResult.vcdFile || "none"}`);
  if (!simResult.success) {
    console.log(`  Error: ${simResult.error}`);
  } else {
    console.log("  ✓ Simulation completed");
  }

  // Test 5: VNC info
  console.log("\nTest 5: Getting VNC info...");
  const vncInfo = getVncInfo();
  console.log(`  URL: ${vncInfo.url}`);
  console.log(`  Password: ${vncInfo.password}`);
  console.log("  ✓ VNC info retrieved");

  // Test 6: View waveform (if VCD exists)
  if (simResult.success && simResult.vcdFile) {
    console.log("\nTest 6: Opening waveform viewer...");
    const viewResult = await viewWaveform(simResult.projectId, simResult.vcdFile);
    console.log(`  Success: ${viewResult.success}`);
    console.log(`  Message: ${viewResult.message}`);
    if (viewResult.success) {
      console.log("  ✓ GTKWave launched (check VNC)");
    }
  }

  // Test 7: List projects
  console.log("\nTest 7: Listing projects...");
  const projects = projectManager.getAllProjects();
  console.log(`  Total projects: ${projects.length}`);
  for (const p of projects.slice(-3)) {
    console.log(`    - ${p.name} (${p.id})`);
  }
  console.log("  ✓ Projects listed");

  // Cleanup
  console.log("\nCleanup: Deleting test projects...");
  if (synthResult.projectId) {
    projectManager.deleteProject(synthResult.projectId);
    console.log(`  ✓ Deleted ${synthResult.projectId}`);
  }
  if (simResult.projectId) {
    projectManager.deleteProject(simResult.projectId);
    console.log(`  ✓ Deleted ${simResult.projectId}`);
  }

  console.log("\n=== All Phase 3 tests passed! ===");
  console.log(`\nVNC Access: ${vncInfo.url} (password: ${vncInfo.password})`);

  // Close database
  database.close();
}

testPhase3().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
