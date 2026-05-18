# ralvye.com

Landing page personal con el Halcón Milenario de Star Wars renderizado como vóxeles 3D en la pantalla de un monitor CRT, con física interactiva al hacer clic.

## Stack

- **Three.js** 0.183.1 — renderizado 3D
- **cannon-es** 0.20.0 — motor de física
- **Vite** 7.3.1 — dev server y bundler
- **pnpm** — gestor de paquetes

## Uso local

```bash
pnpm install
pnpm dev
```

Abre `http://localhost:5173`.

## Build

```bash
pnpm build        # genera dist/
pnpm run ship     # build + deploy a GitHub
```

## Estructura

```
index.html                   # shell HTML con UI overlay
main.js                      # toda la lógica 3D (Three.js + Cannon-es)
generate_falcon.py           # genera millennium-falcon.png (28×22px)
public/
  millennium-falcon.png      # pixel art fuente del Halcón
  crt-draco.glb              # modelo 3D del monitor CRT (Draco comprimido)
  cv.html                    # página de CV
  core.css / cv.css          # estilos del CV
```

## Licencia

ISC
