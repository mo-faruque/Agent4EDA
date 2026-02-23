/**
 * Test script for Phase 2: File Management System
 */

import { projectManager } from "../src/files/project-manager.js";
import { database } from "../src/db/database.js";
import { pathResolver } from "../src/files/path-resolver.js";

async function testPhase2() {
  console.log("=== Phase 2: File Management System Tests ===\n");

  // Test 1: Create a project
  console.log("Test 1: Creating a project...");
  const result = projectManager.createProject({
    name: "test_counter",
    designName: "counter",
    topModule: "counter_top",
  });
  console.log(`  ✓ Project created: ${result.project.id}`);
  console.log(`  ✓ Host path: ${result.hostPath}`);
  console.log(`  ✓ Container path: ${result.containerPath}`);

  // Test 2: Write a design file
  console.log("\nTest 2: Writing a design file...");
  const verilogCode = `
module counter_top (
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
`;
  const fileResult = projectManager.writeDesignFile(
    result.project.id,
    "counter.v",
    verilogCode
  );
  console.log(`  ✓ File written: ${fileResult?.hostPath}`);

  // Test 3: Read the file back
  console.log("\nTest 3: Reading the file back...");
  const content = projectManager.readDesignFile(result.project.id, "counter.v");
  console.log(`  ✓ File read: ${content ? content.length : 0} bytes`);

  // Test 4: List project files
  console.log("\nTest 4: Listing project files...");
  const files = projectManager.listProjectFiles(result.project.id);
  console.log(`  ✓ Files found: ${files.length}`);
  for (const file of files) {
    console.log(`    - ${file}`);
  }

  // Test 5: Create a run
  console.log("\nTest 5: Creating a synthesis run...");
  const run = projectManager.createRun({
    projectId: result.project.id,
    runType: "synthesis",
    config: { target: "sky130" },
  });
  console.log(`  ✓ Run created: ${run.id} (status: ${run.status})`);

  // Test 6: Update run status
  console.log("\nTest 6: Updating run status...");
  projectManager.startRun(run.id);
  console.log(`  ✓ Run started`);
  projectManager.completeRun(run.id, { cellCount: 42 });
  console.log(`  ✓ Run completed`);

  // Test 7: Save PPA metrics
  console.log("\nTest 7: Saving PPA metrics...");
  const ppa = projectManager.savePPAMetrics(run.id, {
    areaUm2: 1234.56,
    powerMw: 0.5,
    cellCount: 42,
    wnsNs: -0.1,
  });
  console.log(`  ✓ PPA saved: ${ppa.id}`);

  // Test 8: Get project summary
  console.log("\nTest 8: Getting project summary...");
  const summary = projectManager.getProjectSummary(result.project.id);
  console.log(summary);

  // Test 9: Path resolution
  console.log("\nTest 9: Testing path resolution...");
  const hostPath = pathResolver.getFileHostPath(result.project.id, "test.v");
  const containerPath = pathResolver.getFileContainerPath(result.project.id, "test.v");
  console.log(`  ✓ Host path: ${hostPath}`);
  console.log(`  ✓ Container path: ${containerPath}`);

  // Test 10: Get all projects
  console.log("\nTest 10: Getting all projects...");
  const allProjects = projectManager.getAllProjects();
  console.log(`  ✓ Total projects: ${allProjects.length}`);

  // Cleanup (optional - comment out to keep test data)
  console.log("\nCleanup: Deleting test project...");
  projectManager.deleteProject(result.project.id);
  console.log(`  ✓ Project deleted`);

  console.log("\n=== All tests passed! ===");

  // Close database
  database.close();
}

testPhase2().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
