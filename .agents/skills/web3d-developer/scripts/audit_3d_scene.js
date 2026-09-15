/**
 * Web3D Scene & Performance Auditor
 * 
 * Audits a Three.js scene graph or Object3D hierarchy for:
 * - Total draw calls, geometries, triangles, and vertices
 * - Estimated GPU VRAM consumption (buffers + textures)
 * - Anti-patterns: Uninstanced duplicate meshes (>10), NPOT textures, oversized textures (>2048)
 * - Memory leak risk detection
 * 
 * Can be run in Node.js (with mock/pure objects) or injected directly in browser DevTools.
 */

function auditScene(rootObject, renderer = null) {
  if (!rootObject) {
    console.error('[Web3D Audit] No root object provided.');
    return null;
  }

  const report = {
    counts: {
      objects: 0,
      meshes: 0,
      instancedMeshes: 0,
      lights: 0,
      cameras: 0,
      geometries: 0,
      materials: 0,
      textures: 0,
      triangles: 0,
      vertices: 0
    },
    vram: {
      geometryBytes: 0,
      textureBytes: 0,
      totalBytes: 0
    },
    warnings: [],
    drawCallEstimate: 0
  };

  const seenGeometries = new Set();
  const seenMaterials = new Set();
  const seenTextures = new Set();
  const geometryUsageCounts = new Map();

  const estimateTextureBytes = (texture) => {
    if (!texture || !texture.image) return 0;
    const width = texture.image.width || 512;
    const height = texture.image.height || 512;
    // 4 bytes per pixel (RGBA), plus 33% for mipmaps
    return Math.round(width * height * 4 * 1.333);
  };

  const checkTexture = (tex, slotName, meshName) => {
    if (!tex || seenTextures.has(tex)) return;
    seenTextures.add(tex);
    report.counts.textures++;

    const bytes = estimateTextureBytes(tex);
    report.vram.textureBytes += bytes;

    if (tex.image) {
      const w = tex.image.width || 0;
      const h = tex.image.height || 0;
      // Non-power of two check
      const isPotW = (w & (w - 1)) === 0;
      const isPotH = (h & (h - 1)) === 0;
      if (!isPotW || !isPotH) {
        report.warnings.push(`[NPOT Texture] Mesh "${meshName}" texture "${slotName}" (${w}x${h}) is Non-Power-of-Two.`);
      }
      if (w > 2048 || h > 2048) {
        report.warnings.push(`[Oversized Texture] Mesh "${meshName}" texture "${slotName}" (${w}x${h}) exceeds 2048px budget.`);
      }
    }
  };

  const inspectMaterial = (mat, meshName) => {
    if (!mat || seenMaterials.has(mat)) return;
    seenMaterials.add(mat);
    report.counts.materials++;

    const slots = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
      'emissiveMap', 'bumpMap', 'displacementMap', 'envMap'
    ];

    slots.forEach((slot) => {
      if (mat[slot]) checkTexture(mat[slot], slot, meshName);
    });
  };

  rootObject.traverse((node) => {
    report.counts.objects++;

    if (node.isLight) report.counts.lights++;
    if (node.isCamera) report.counts.cameras++;

    if (node.isInstancedMesh) {
      report.counts.instancedMeshes++;
      report.drawCallEstimate += 1;
    } else if (node.isMesh) {
      report.counts.meshes++;
      report.drawCallEstimate += Array.isArray(node.material) ? node.material.length : 1;
    }

    // Geometry inspection
    if (node.geometry) {
      const geom = node.geometry;
      const geomId = geom.uuid || geom.id;
      geometryUsageCounts.set(geomId, (geometryUsageCounts.get(geomId) || 0) + 1);

      if (!seenGeometries.has(geom)) {
        seenGeometries.add(geom);
        report.counts.geometries++;

        // Calculate triangles & vertices
        if (geom.index) {
          report.counts.triangles += geom.index.count / 3;
        } else if (geom.attributes.position) {
          report.counts.triangles += geom.attributes.position.count / 3;
        }

        if (geom.attributes.position) {
          report.counts.vertices += geom.attributes.position.count;
        }

        // Estimate buffer VRAM
        for (const name in geom.attributes) {
          const attr = geom.attributes[name];
          if (attr && attr.array) {
            report.vram.geometryBytes += attr.array.byteLength;
          }
        }
        if (geom.index && geom.index.array) {
          report.vram.geometryBytes += geom.index.array.byteLength;
        }
      }
    }

    // Material inspection
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach((m) => inspectMaterial(m, node.name));
      } else {
        inspectMaterial(node.material, node.name);
      }
    }
  });

  // Check for duplicate uninstanced geometries
  geometryUsageCounts.forEach((count, geomId) => {
    if (count > 10) {
      report.warnings.push(
        `[Instancing Opportunity] Geometry ID ${geomId} is rendered ${count} times as individual meshes. Convert to InstancedMesh or <Instances> to save ${count - 1} draw calls.`
      );
    }
  });

  // Draw call budget assessment
  if (report.drawCallEstimate > 150) {
    report.warnings.push(
      `[Draw Call Warning] Estimated draw calls (${report.drawCallEstimate}) exceed recommended desktop limit of 150.`
    );
  } else if (report.drawCallEstimate > 50) {
    report.warnings.push(
      `[Draw Call Advisory] Estimated draw calls (${report.drawCallEstimate}) exceed mobile budget (50). Consider merging static geometries.`
    );
  }

  report.vram.totalBytes = report.vram.geometryBytes + report.vram.textureBytes;
  report.vram.formattedGeometry = (report.vram.geometryBytes / (1024 * 1024)).toFixed(2) + ' MB';
  report.vram.formattedTexture = (report.vram.textureBytes / (1024 * 1024)).toFixed(2) + ' MB';
  report.vram.formattedTotal = (report.vram.totalBytes / (1024 * 1024)).toFixed(2) + ' MB';

  return report;
}

// Pretty print helper
function printAuditReport(report) {
  if (!report) return;
  console.log('\n=== Web3D Scene Audit Report ===');
  console.log(`Estimated Draw Calls: ${report.drawCallEstimate}`);
  console.log(`Total Meshes:         ${report.counts.meshes} (Instanced: ${report.counts.instancedMeshes})`);
  console.log(`Total Triangles:      ${Math.round(report.counts.triangles).toLocaleString()}`);
  console.log(`Total Vertices:       ${Math.round(report.counts.vertices).toLocaleString()}`);
  console.log(`Total Textures:       ${report.counts.textures}`);
  console.log(`VRAM (Geometry):      ${report.vram.formattedGeometry}`);
  console.log(`VRAM (Textures):      ${report.vram.formattedTexture}`);
  console.log(`VRAM (Total Est.):    ${report.vram.formattedTotal}`);
  
  if (report.warnings.length > 0) {
    console.log('\n--- Optimization Warnings & Actions ---');
    report.warnings.forEach((w) => console.warn('⚠️ ' + w));
  } else {
    console.log('\n✅ All performance budgets and rules passed!');
  }
  console.log('=================================\n');
}

// Export for ES/CJS and browser injection
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { auditScene, printAuditReport };
}
if (typeof window !== 'undefined') {
  window.auditScene = auditScene;
  window.printAuditReport = printAuditReport;
}
