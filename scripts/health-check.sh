#!/bin/bash
#
# Health Check Script for MCP4EDA
# Verifies all required tools are available and working
#

set -e

CONTAINER_NAME="${DOCKER_CONTAINER_NAME:-mcp4eda}"

echo "========================================="
echo "MCP4EDA Health Check"
echo "========================================="
echo ""

# Check Docker
echo "[1/7] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "  ERROR: Docker is not installed"
    exit 1
fi
echo "  OK: Docker is installed"

# Check if container is running
echo ""
echo "[2/7] Checking container status..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "  WARNING: Container '${CONTAINER_NAME}' is not running"
    echo "  Starting container..."
    docker-compose -f docker/docker-compose.yml up -d
    sleep 5
fi
echo "  OK: Container is running"

# Check Yosys
echo ""
echo "[3/7] Checking Yosys..."
YOSYS_VERSION=$(docker exec ${CONTAINER_NAME} yosys -V 2>&1 | head -1)
if [ $? -eq 0 ]; then
    echo "  OK: ${YOSYS_VERSION}"
else
    echo "  ERROR: Yosys not available"
    exit 1
fi

# Check Icarus Verilog
echo ""
echo "[4/7] Checking Icarus Verilog..."
IVERILOG_VERSION=$(docker exec ${CONTAINER_NAME} iverilog -V 2>&1 | head -1)
if [ $? -eq 0 ]; then
    echo "  OK: ${IVERILOG_VERSION}"
else
    echo "  ERROR: Icarus Verilog not available"
    exit 1
fi

# Check OpenLane
echo ""
echo "[5/7] Checking OpenLane..."
OPENLANE_VERSION=$(docker exec ${CONTAINER_NAME} python3 -m openlane --version 2>&1 || echo "not found")
if [[ "${OPENLANE_VERSION}" != *"not found"* ]]; then
    echo "  OK: OpenLane ${OPENLANE_VERSION}"
else
    echo "  WARNING: OpenLane may not be available"
fi

# Check Python and ChromaDB
echo ""
echo "[6/7] Checking Python environment..."
PYTHON_VERSION=$(docker exec ${CONTAINER_NAME} python3 --version 2>&1)
echo "  ${PYTHON_VERSION}"

CHROMADB_CHECK=$(docker exec ${CONTAINER_NAME} python3 -c "import chromadb; print('ChromaDB OK')" 2>&1 || echo "not installed")
if [[ "${CHROMADB_CHECK}" == *"OK"* ]]; then
    echo "  OK: ChromaDB installed"
else
    echo "  WARNING: ChromaDB not installed - RAG features may not work"
fi

# Check volume mounts
echo ""
echo "[7/7] Checking volume mounts..."
docker exec ${CONTAINER_NAME} test -d /workspace/projects && echo "  OK: /workspace/projects mounted" || echo "  WARNING: projects not mounted"
docker exec ${CONTAINER_NAME} test -d /workspace/chroma-data && echo "  OK: /workspace/chroma-data mounted" || echo "  WARNING: chroma-data not mounted"
docker exec ${CONTAINER_NAME} test -d /workspace/cache && echo "  OK: /workspace/cache mounted" || echo "  WARNING: cache not mounted"

echo ""
echo "========================================="
echo "Health check complete!"
echo "========================================="
