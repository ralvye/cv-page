# ralvye.com - 3D Voxel Landing Page

## Overview
Personal landing page for Ralvye. A pixel art Millennium Falcon (Star Wars) rendered as 3D voxels on the screen of a CRT monitor model, with physics-based click-to-explode interaction.

## Tech Stack
- **Three.js** (0.183.1) - 3D rendering
- **cannon-es** (0.20.0) - Physics engine
- **Vite** (7.3.1) - Dev server and bundler
- **pnpm** - Package manager

## Project Structure
```
main.js              # All 3D scene logic (single file)
index.html           # HTML shell with overlay UI
package.json         # Scripts: dev, build
public/              # Static assets (copied to dist by Vite)
  millennium-falcon.png        # Pixel art source image of the Millennium Falcon
  crt-draco.glb      # Draco-compressed CRT monitor model (74KB)
  draco/             # Local Draco decoder (copied from three/examples)
```

### Files NOT deployed (source/dev only)
```
uploads_files_3247901_CRT+Monitor.fbx  # Original FBX model (1.2MB)
uploads_files_3247901_CRT+Screen.obj   # Original OBJ screen mesh (1.9MB)
uploads_files_3247901_CRT+Screen.mtl   # Material file for OBJ
crt.glb                                 # Uncompressed GLB (890KB)
```

## Key Architecture Decisions

### CRT Monitor Model
- Original FBX converted to GLB via `obj2gltf`, then Draco-compressed via `gltf-pipeline` (1.2MB -> 74KB)
- Model is rotated -90 degrees on Y axis to face camera
- `crtGroup` positioned at `(-8.7, 0, -29)` to center it in scene
- All meshes get a procedural beige plastic texture (`bodyTex`) with NearestFilter for pixel-art look
- Draco decoder loaded from CDN: `https://cdn.jsdelivr.net/npm/three@0.183.1/examples/jsm/libs/draco/`
  - Local copy also exists at `/public/draco/` as fallback

### Millennium Falcon Voxels
- Loaded from `millennium-falcon.png` via offscreen canvas pixel reading
- Colors quantized: values > 180 snap to 255, others snap to nearest 32
- White voxels get emissive glow (0.3, 0.3, 0.3)
- All voxels live in `falconGroup` positioned at `(-6.5, -2.0, -26.5)` with rotation.x = -0.14
- Screen backing is a curved PlaneGeometry (32 segments, CRT bulge = -0.5) scaled to (0.70, 0.80, 1)
- Screen dimensions: 45 x 34 units (4:3 ratio)

### CRT Screen Effects (Shader)
- Animated via `uTime` uniform
- Scanlines, vignette, chromatic aberration, static noise, horizontal flicker band, barrel distortion
- Subtle green/blue phosphor tint
- CRT overlay plane at z=0.40, same curvature and scale as screen backing

### Physics (cannon-es)
- Gravity: (0, -9.8, 0)
- Ground plane at y=-26
- CRT collider box at (-8.7, -5, -62) with half-extents (27, 21, 33)
- Voxels start as KINEMATIC, switch to DYNAMIC on click
- Click explosion: raycasts to voxels, converts hit to local space, applies impulse with random jitter
- Activated voxels are moved from falconGroup to scene (world space) for physics sync
- Linear damping 0.3, angular damping 0.4

### Scene Layout
- Camera: 25-degree angle, distance 110 (150 on mobile)
- Room: 600-unit box with BackSide material, color `#8a7e6e`, floor at y=-26
- Desk lamp: to the right at x=30, warm PointLight (0xffe4c4, intensity 80)
- Screen glow: cool PointLight (0xddeeff, intensity 40) at (-4, -2, -20)
- Ambient light: very low (0.08) so lamp and screen are primary light sources

### Debug Mode
- Toggle with `Ctrl+Shift+D`
- Shows falcon group and screen positions
- WASD/QE moves falconGroup, R/F adjusts screen Z, T/G adjusts overlay Z

## Commands
```bash
pnpm dev          # Start Vite dev server
pnpm build        # Build to dist/
```

## Deployment Target
- GitHub repo: `ralvye/ralvye.com` (branch: main)
- Hosted via Cloudflare Pages
- CNAME: `ralvye.com`
- Static site - no server-side rendering, just built HTML/JS/assets

## Gotchas
- The Draco decoder path must match the Three.js version or the GLB won't load
- `scene.background = null` means canvas is transparent - body background shows through
- When voxels activate (physics), they must be moved from falconGroup to scene to avoid coordinate mismatch
- `pnpm deploy` is a reserved pnpm command (don't use it)
- cannon-es uses `setFromAxisAngle` not `setFromEulerAngles`
