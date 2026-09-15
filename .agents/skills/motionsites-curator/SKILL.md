---
name: motionsites-curator
description: Searches, extracts, and implements top-tier 3D motion design patterns from MotionSites (motionsites.ai) and spatial web design libraries. Use when the user asks to "find 3D designs from MotionSites", "add cinematic 3D motion", "apply trending 3D hero", or "style webpage with modern motion physics".
version: 1.0.0
stack:
  - Python (pattern discovery)
  - React Three Fiber (@react-three/fiber, @react-three/drei, @react-three/rapier)
  - Framer Motion
  - Tailwind CSS
---

# MotionSites 3D Webpage Curator & Implementer

## Objective
Identify top 3D web motion designs (liquid glass, cursor-tracking physics, zero-g floating meshes, scroll scrubbing) inspired by MotionSites, and generate the corresponding React Three Fiber (R3F) and Tailwind components directly into the local project.

---

## Workflow

### Step 1: Discover Motion Patterns
Run the bundled script to search the curated database of MotionSites design patterns:
```bash
python .agents/skills/motionsites-curator/scripts/search_motionsites.py --query "<user_topic_or_style>"
```

### Step 2: Install Project Dependencies
Ensure the target project has the required WebGL and motion packages installed:
```bash
npm install three @react-three/fiber @react-three/drei @react-three/rapier framer-motion lucide-react
```

### Step 3: Implement Curated Pattern
Choose the matching pattern from the query results and scaffold the components:
1. **Zero-G Floating Shards**: Weightless translucent meshes floating in space with Rapier rigid-body collisions and dynamic cursor repulsion.
2. **Kinetic Distort Sphere**: High-poly wireframe/mesh with noise-based distortion tracking mouse tilt with smooth lerp physics.
3. **Scroll-Driven 3D Carousel**: Floating perspective cards with Framer Motion scroll scrubbing and liquid glass borders.

### Step 4: Apply MotionSites Aesthetic Directives
- **Palette**: Pitch black (`#000000`) background, crisp white typography, subtle accent glows (`#6366F1` or `#A855F7` at 15-20% opacity).
- **Glassmorphism**: Signature `.liquid-glass` styling (`backdrop-filter: blur(16px)`, `1px solid rgba(255,255,255,0.08)`, inner specular highlights).
- **Typography**: Geometric sans for UI elements paired with italicized serif accents for emphasis keywords.
