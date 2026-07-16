export const CACHE_SCHEMA_VERSION = 2

const unitPattern = [
  'quilogramas?', 'kg', 'gramas?', 'g', 'miligramas?', 'mg', 'mililitros?', 'ml',
  'litros?', 'l', 'unidades?', 'unid\\.?', 'fatias?', 'colheres?(?:\\s+de\\s+(?:sopa|cha))?',
  'xicaras?', 'copos?', 'pratos?', 'scoops?', 'potes?', 'porcoes?',
].join('|')
const portionRegex = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:(${unitPattern})\\s*(?:de\\s+)?)?(.+?)(?=(?:\\s*(?:,|;|\\+)\\s*|\\s+e\\s+)(?=\\d+(?:[.,]\\d+)?\\s*(?:${unitPattern})?\\b)|$)`, 'giu')

export type CanonicalPortion = { amount: number; unit: string; name: string }

export function normalizeText(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[“”"'`]/g, '').replace(/\s+/g, ' ').trim()
}

function singularize(word: string) {
  if (word === 'paes') return 'pao'
  if (word.endsWith('oes') && word.length > 4) return `${word.slice(0, -3)}ao`
  return /[aeiou]s$/.test(word) && word.length > 3 ? word.slice(0, -1) : word
}

function foodName(value: string) {
  return normalizeText(value).replace(/^[\s:,-]*(?:de|do|da|dos|das)\s+/, '').replace(/\s+(?:no|na)\s+(?:cafe da manha|almoco|jantar|lanche|ceia)\s*$/, '').replace(/[.!?]+$/, '').split(' ').map(singularize).join(' ').trim()
}

function canonicalUnit(rawUnit: string | undefined, rawAmount: string) {
  const unit = normalizeText(rawUnit || 'unidade').replace(/\.$/, '')
  const amount = Number(rawAmount.replace(',', '.'))
  if (unit === 'kg' || unit.startsWith('quilograma')) return { amount: amount * 1000, unit: 'g' }
  if (unit === 'mg' || unit.startsWith('miligrama')) return { amount: amount / 1000, unit: 'g' }
  if (unit.startsWith('grama')) return { amount, unit: 'g' }
  if (unit === 'l' || unit.startsWith('litro')) return { amount: amount * 1000, unit: 'ml' }
  if (unit.startsWith('mililitro')) return { amount, unit: 'ml' }
  for (const [prefix, canonical] of [['unid', 'unidade'], ['fatia', 'fatia'], ['xicara', 'xicara'], ['copo', 'copo'], ['prato', 'prato'], ['scoop', 'scoop'], ['pote', 'pote'], ['porcao', 'porcao']] as const) if (unit.startsWith(prefix)) return { amount, unit: canonical }
  if (unit.startsWith('colher')) return { amount, unit: unit.includes('cha') ? 'colher-cha' : 'colher-sopa' }
  return { amount, unit: unit || 'unidade' }
}

export function extractFoodPortions(description: string): CanonicalPortion[] {
  const normalized = normalizeText(description).replace(/\b(?:eu\s+)?(?:comi|consumi|ingeri|tomei)\b\s*/g, '')
  const portions: CanonicalPortion[] = []
  portionRegex.lastIndex = 0
  for (const match of normalized.matchAll(portionRegex)) {
    const name = foodName(match[3])
    const { amount, unit } = canonicalUnit(match[2], match[1])
    if (name.length >= 2 && Number.isFinite(amount) && amount > 0) portions.push({ amount: Number(amount.toFixed(3)), unit, name })
  }
  return portions
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function canonicalFoodKey(description: string) {
  const portions = extractFoodPortions(description)
  const canonical = portions.length ? portions.map(item => `${item.amount}${item.unit}:${item.name}`).sort((a, b) => a.localeCompare(b, 'pt-BR')).join('|') : normalizeText(description).replace(/\b(?:eu\s+)?(?:comi|consumi|ingeri|tomei)\b\s*/g, '')
  return { key: await sha256(`food-cache-v${CACHE_SCHEMA_VERSION}:${canonical}`), canonical, portions, strategy: portions.length ? 'portions' : 'description' }
}

export async function itemKey(name: string, unit: string) {
  return sha256(`food-item-v${CACHE_SCHEMA_VERSION}:${unit}:${name}`)
}
