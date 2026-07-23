import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDetectedMealDescription, scaledImageDimensions } from '../src/lib/meal-image.ts'

test('formata alimentos detectados em uma descrição reaproveitável pelo estimador', () => {
  const description = formatDetectedMealDescription([
    { name: 'arroz branco', quantity: 120, unit: 'g', confidence: 'high' },
    { name: 'filé de frango', quantity: 1, unit: 'unidade', confidence: 'medium' },
  ])
  assert.equal(description, '120 g de arroz branco, 1 unidade de filé de frango')
})

test('ignora itens detectados incompletos ao criar a descrição', () => {
  const description = formatDetectedMealDescription([
    { name: 'feijão', quantity: 0, unit: 'g', confidence: 'low' },
    { name: 'salada', quantity: 80, unit: 'g', confidence: 'medium' },
  ])
  assert.equal(description, '80 g de salada')
})

test('reduz a maior dimensão sem distorcer a imagem', () => {
  assert.deepEqual(scaledImageDimensions(4032, 3024), { width: 1600, height: 1200 })
  assert.deepEqual(scaledImageDimensions(800, 600), { width: 800, height: 600 })
})
