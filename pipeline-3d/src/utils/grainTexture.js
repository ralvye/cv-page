import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const SIZE = 256
const MIN_LEVEL = 236
const LEVEL_RANGE = 20

export function createGrainTexture(repeat) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  const image = context.createImageData(SIZE, SIZE)

  for (let i = 0; i < image.data.length; i += 4) {
    const level = MIN_LEVEL + Math.floor(Math.random() * LEVEL_RANGE)
    image.data[i] = level
    image.data[i + 1] = level
    image.data[i + 2] = level
    image.data[i + 3] = 255
  }
  context.putImageData(image, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(...repeat)
  texture.colorSpace = SRGBColorSpace
  return texture
}
