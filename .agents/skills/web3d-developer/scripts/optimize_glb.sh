#!/usr/bin/env bash
# ==============================================================================
# Web3D GLB Optimization Pipeline
# Uses @gltf-transform/cli to prune, dedup, quantize, Draco/Meshopt compress,
# and optimize textures for production web deployment.
# ==============================================================================

set -e

if [ "$#" -lt 1 ]; then
    echo "Usage: ./optimize_glb.sh <input.glb> [output.glb]"
    echo "Example: ./optimize_glb.sh raw_conveyor.glb conveyor_optimized.glb"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="${2:-${INPUT_FILE%.glb}_optimized.glb}"

if ! command -v npx &> /dev/null; then
    echo "Error: npx is required to run gltf-transform."
    exit 1
fi

echo "=============================================="
echo "Starting Web3D GLB Asset Optimization"
echo "Input:  $INPUT_FILE"
echo "Output: $OUTPUT_FILE"
echo "=============================================="

# Step 1: Geometry cleanup, deduplication, weld, and prune
echo "[1/3] Pruning unused nodes, deduplicating accessors, and welding vertices..."
npx -y @gltf-transform/cli optimize "$INPUT_FILE" "$OUTPUT_FILE" \
    --prune true \
    --dedup true \
    --weld true \
    --texture-compress webp

# Step 2: Draco Mesh Compression (Aggressive byte savings)
echo "[2/3] Applying Draco compression..."
npx -y @gltf-transform/cli draco "$OUTPUT_FILE" "$OUTPUT_FILE" \
    --method edgebreaker \
    --quantize-position 14 \
    --quantize-normal 10 \
    --quantize-texcoord 12

echo "[3/3] Inspecting final optimized asset..."
npx -y @gltf-transform/cli inspect "$OUTPUT_FILE"

echo "=============================================="
echo "Optimization complete! Saved to: $OUTPUT_FILE"
echo "=============================================="
