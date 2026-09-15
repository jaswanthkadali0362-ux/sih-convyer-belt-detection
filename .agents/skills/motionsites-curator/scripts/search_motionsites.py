#!/usr/bin/env python3
"""
Search and retrieve curated 3D motion design patterns from MotionSites specifications.
Outputs structured JSON consumed by Antigravity agents.
"""

import argparse
import json
import sys

LIBRARY = [
    {
        "id": "antigravity-zero-g",
        "name": "Zero-G Floating Shard Field",
        "tags": ["antigravity", "physics", "floating", "rapier", "glass"],
        "category": "3D Interactive Hero",
        "description": "Weightless translucent geometry floating in space with Rapier rigid-body collision and dynamic cursor repulsion.",
        "materials": "MeshTransmissionMaterial (roughness=0.1, chromaticAberration=0.08, thickness=0.4)",
        "physics": "Rapier zero-gravity (gravity=[0,0,0]) with kinematic cursor ball collider",
        "lighting": "Dual directional rim lights (#818cf8, #c084fc)"
    },
    {
        "id": "kinetic-distort-sphere",
        "name": "Kinetic Wireframe Liquid Core",
        "tags": ["sphere", "liquid", "abstract", "kinetic", "core"],
        "category": "Organic Hero Centerpiece",
        "description": "High-poly sphere with noise-based distortion tracking mouse tilt with smooth lerp physics.",
        "materials": "MeshDistortMaterial (wireframe=true, distort=0.45, speed=2.0)",
        "physics": "Pointer lerp interpolation inside useFrame hook",
        "lighting": "Single colored point light with ambient fill"
    },
    {
        "id": "scroll-scrubbed-carousel",
        "name": "Scroll-Driven 3D Carousel & Bento",
        "tags": ["scroll", "bento", "framer-motion", "cards"],
        "category": "Content Presentation",
        "description": "3D floating cards that rotate into perspective as the user scrolls, paired with liquid-glass borders.",
        "materials": "CSS 3D perspective with backdrop-filter glass overlays",
        "physics": "Framer Motion useScroll and useTransform progress scrub",
        "lighting": "Radial spotlight torchlight tracking cursor coordinates"
    }
]

def search(query: str):
    query_lower = query.lower()
    matches = []
    for item in LIBRARY:
        score = sum(1 for tag in item["tags"] if tag in query_lower)
        if any(w in item["name"].lower() or w in item["description"].lower() for w in query_lower.split()):
            score += 2
        if score > 0:
            matches.append((score, item))
            
    matches.sort(key=lambda x: x[0], reverse=True)
    results = [m[1] for m in matches] if matches else LIBRARY
    return results

def main():
    parser = argparse.ArgumentParser(description="MotionSites 3D Pattern Finder")
    parser.add_argument("--query", type=str, default="antigravity", help="Search keywords")
    args = parser.parse_args()

    results = search(args.query)
    print(json.dumps({"count": len(results), "patterns": results}, indent=2))

if __name__ == "__main__":
    main()
