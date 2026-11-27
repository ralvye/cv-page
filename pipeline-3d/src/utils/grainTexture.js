import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three'

const SIZE = 512
const SEED = 20260
const OCTAVES = [
  { cells: 4, weight: 0.5 },
  { cells: 16, weight: 0.3 },
  { cells: 64, weight: 0.2 },
]
const SPECKLE = 0.04
const MIN_LEVEL = 232
const LEVEL_RANGE = 23

function mulberry32(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

// Lattice indices wrap around the tile edge so the texture repeats without seams.
function buildHeightField(random) {
  const height = new Float32Array(SIZE * SIZE)

  for (const { cells, weight } of OCTAVES) {
    const lattice = new Float32Array(cells * cells)
    for (let i = 0; i < lattice.length; i++) lattice[i] = random()

    for (let y = 0; y < SIZE; y++) {
      const v = (y / SIZE) * cells
      const y0 = Math.floor(v)
      const fy = smooth(v - y0)
      const row0 = y0 * cells
      const row1 = ((y0 + 1) % cells) * cells

      for (let x = 0; x < SIZE; x++) {
        const u = (x / SIZE) * cells
        const x0 = Math.floor(u)
        const fx = smooth(u - x0)
        const x1 = (x0 + 1) % cells
        const top = lattice[row0 + x0] + (lattice[row0 + x1] - lattice[row0 + x0]) * fx
        const bottom = lattice[row1 + x0] + (lattice[row1 + x1] - lattice[row1 + x0]) * fx
        height[y * SIZE + x] += weight * (top + (bottom - top) * fy)
      }
    }
  }

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < height.length; i++) {
    min = Math.min(min, height[i])
    max = Math.max(max, height[i])
  }
  const range = max - min
  for (let i = 0; i < height.length; i++) {
    const normalized = (height[i] - min) / range + (random() - 0.5) * SPECKLE
    height[i] = Math.min(1, Math.max(0, normalized))
  }

  return height
}

function heightToCanvas(height, toLevel) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  const image = context.createImageData(SIZE, SIZE)

  for (let i = 0; i < height.length; i++) {
    const level = toLevel(height[i])
    image.data[i * 4] = level
    image.data[i * 4 + 1] = level
    image.data[i * 4 + 2] = level
    image.data[i * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)

  return canvas
}

function createTexture(canvas, repeat, anisotropy, colorSpace) {
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(...repeat)
  texture.anisotropy = anisotropy
  texture.colorSpace = colorSpace
  return texture
}

export function createGrainTexture(repeat, anisotropy = 1) {
  const height = buildHeightField(mulberry32(SEED))

  const map = createTexture(
    heightToCanvas(height, (h) => Math.round(MIN_LEVEL + h * LEVEL_RANGE)),
    repeat,
    anisotropy,
    SRGBColorSpace,
  )
  const bumpMap = createTexture(
    heightToCanvas(height, (h) => Math.round(h * 255)),
    repeat,
    anisotropy,
    NoColorSpace,
  )

  return { map, bumpMap }
}
