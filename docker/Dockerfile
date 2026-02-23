# MCP4EDA Docker Image
# Extends IIC-OSIC-TOOLS with additional dependencies for RAG and AutoTuner
#
# Base image includes:
# - Yosys (synthesis)
# - Icarus Verilog (simulation)
# - OpenLane/OpenROAD (RTL-to-GDSII)
# - Magic, Netgen, KLayout (DRC, LVS, layout)
# - Python 3 environment

FROM hpretl/iic-osic-tools:latest

LABEL maintainer="MCP4EDA"
LABEL description="EDA tools container for MCP4EDA with RAG and AutoTuner support"

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PDK=sky130A
ENV PDK_ROOT=/foss/pdks
# Add EDA tools to PATH (needed when using --skip mode)
ENV PATH="/foss/tools/bin:/foss/tools/OpenROAD-flow-scripts/tools/AutoTuner/src:${PATH}"
# ORFS environment
ENV ORFS_ROOT=/foss/tools/OpenROAD-flow-scripts

# Switch to root to install packages and create directories
USER root

# Install additional Python packages for RAG and AutoTuner
# Use --ignore-installed to bypass debian-installed packages that pip can't uninstall
RUN pip3 install --no-cache-dir --ignore-installed \
    chromadb \
    openai \
    requests \
    pyyaml \
    # AutoTuner dependencies
    "ray[tune]>=2.9.0" \
    ax-platform \
    optuna \
    hyperopt \
    nevergrad \
    pandas \
    numpy \
    bayesian-optimization \
    tensorboard

# Clone OpenROAD-flow-scripts for AutoTuner
RUN cd /foss/tools && \
    git clone --depth 1 https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts.git && \
    chmod -R 755 /foss/tools/OpenROAD-flow-scripts

# Install AutoTuner as Python package
RUN cd /foss/tools/OpenROAD-flow-scripts/tools/AutoTuner && \
    pip3 install --no-cache-dir -e . && \
    chmod +x installer.sh setup.sh 2>/dev/null || true

# Create workspace directory with proper permissions
RUN mkdir -p /workspace/projects /workspace/chroma-data /workspace/cache && \
    chmod -R 777 /workspace

# Set working directory
WORKDIR /workspace

# Health check - verify key tools are available
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD yosys -V && iverilog -V && python3 -c "import chromadb; import ray" || exit 1

# Note: Command is set in docker-compose.yml using --skip to bypass base image entrypoint
