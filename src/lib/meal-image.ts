import type { DetectedMealItem } from '../types'

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_IMAGE_BYTES = 4 * 1024 * 1024

export function formatDetectedMealDescription(items: DetectedMealItem[]) {
  return items
    .filter(item => item.name.trim() && Number.isFinite(item.quantity) && item.quantity > 0 && item.unit.trim())
    .map(item => `${Math.round(item.quantity * 100) / 100} ${item.unit.trim()} de ${item.name.trim()}`)
    .join(', ')
}

export function scaledImageDimensions(width: number, height: number, maxDimension = 1600) {
  if (width <= 0 || height <= 0) throw new Error('A imagem possui dimensões inválidas.')
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a imagem.')),
      'image/jpeg',
      quality,
    )
  })
}

async function drawCompressedImage(file: File, maxDimension: number, quality: number) {
  const bitmap = await createImageBitmap(file)
  try {
    const dimensions = scaledImageDimensions(bitmap.width, bitmap.height, maxDimension)
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await canvasToBlob(canvas, quality)
  } finally {
    bitmap.close()
  }
}

export async function prepareMealImage(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Use uma imagem JPG, PNG ou WEBP.')
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('A foto é muito grande. Escolha uma imagem de até 15 MB.')
  }

  let output = await drawCompressedImage(file, 1600, 0.82)
  if (output.size > MAX_OUTPUT_IMAGE_BYTES) output = await drawCompressedImage(file, 1200, 0.72)
  if (output.size > MAX_OUTPUT_IMAGE_BYTES) {
    throw new Error('Não foi possível reduzir a foto para o tamanho aceito.')
  }
  return output
}
