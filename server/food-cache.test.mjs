import assert from 'node:assert/strict'
import test from 'node:test'
import { createCanonicalFoodKey, createFoodCache, extractFoodPortions } from './food-cache.mjs'

test('extrai várias porções separadas por e', () => {
  assert.deepEqual(extractFoodPortions('Comi 100g de arroz cozido e 150 g de frango grelhado'), [
    { amount: 100, unit: 'g', name: 'arroz cozido' },
    { amount: 150, unit: 'g', name: 'frango grelhado' },
  ])
})

test('normaliza kg e g para a mesma chave', () => {
  assert.equal(
    createCanonicalFoodKey('0,1 kg de arroz cozido').key,
    createCanonicalFoodKey('100g arroz cozido').key,
  )
})

test('normaliza litros e mililitros para a mesma chave', () => {
  assert.equal(
    createCanonicalFoodKey('0.25 l de leite integral').key,
    createCanonicalFoodKey('250 ml de leite integral').key,
  )
})

test('a ordem dos itens não altera a chave', () => {
  assert.equal(
    createCanonicalFoodKey('100g arroz e 150g frango').key,
    createCanonicalFoodKey('150g frango e 100g arroz').key,
  )
})

test('preparações diferentes não colidem', () => {
  assert.notEqual(
    createCanonicalFoodKey('100g batata frita').key,
    createCanonicalFoodKey('100g batata cozida').key,
  )
})

test('normaliza plural de unidade e alimento', () => {
  assert.equal(
    createCanonicalFoodKey('comi 3 uvas encapadas').key,
    createCanonicalFoodKey('3 unidades de uva encapada').key,
  )
})

test('cache persiste, conta acertos e expõe estatísticas', () => {
  const cache = createFoodCache(':memory:')
  const estimate = { items: [{ name: 'Arroz', quantity: 100, unit: 'g', calories: 130, protein: 2.5, carbs: 28, fat: 0.3 }], totalCalories: 130, confidence: 'medium', note: 'teste' }
  cache.set('100g de arroz', estimate, 'test-model')
  const hit = cache.get('0,1kg arroz')
  assert.deepEqual(hit.value, estimate)
  assert.equal(hit.hitCount, 1)
  assert.deepEqual(cache.stats(), {
    entries: 1,
    hits: 1,
    itemEntries: 1,
    itemHits: 0,
    savedRequests: 1,
    newest_entry: cache.stats().newest_entry,
    last_hit: cache.stats().last_hit,
    schemaVersion: 2,
  })
  cache.close()
})

test('compõe e escala uma nova refeição usando alimentos individuais salvos', () => {
  const cache = createFoodCache(':memory:')
  cache.set('100g arroz e 150g frango', {
    items: [
      { name: 'Arroz cozido', quantity: 100, unit: 'g', calories: 130, protein: 2.5, carbs: 28, fat: 0.3 },
      { name: 'Frango grelhado', quantity: 150, unit: 'g', calories: 240, protein: 46, carbs: 0, fat: 5 },
    ],
    totalCalories: 370,
    confidence: 'high',
    note: 'teste',
  }, 'test-model')

  const composed = cache.get('200g arroz')
  assert.equal(composed.canonical.strategy, 'items')
  assert.deepEqual(composed.value.items, [
    { name: 'Arroz cozido', quantity: 200, unit: 'g', calories: 260, protein: 5, carbs: 56, fat: 0.6 },
  ])
  assert.equal(composed.value.totalCalories, 260)
  assert.equal(cache.stats().savedRequests, 1)
  cache.close()
})
