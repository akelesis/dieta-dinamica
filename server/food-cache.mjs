import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export const CACHE_SCHEMA_VERSION = 2

const unitPattern = [
  'quilogramas?', 'kg', 'gramas?', 'g', 'miligramas?', 'mg',
  'mililitros?', 'ml', 'litros?', 'l', 'unidades?', 'unid\\.?',
  'fatias?', 'colheres?(?:\\s+de\\s+(?:sopa|cha))?', 'xicaras?',
  'copos?', 'pratos?', 'scoops?', 'potes?', 'porcoes?',
].join('|')

const portionRegex = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(?:(${unitPattern})\\s*(?:de\\s+)?)?(.+?)(?=(?:\\s*(?:,|;|\\+)\\s*|\\s+e\\s+)(?=\\d+(?:[.,]\\d+)?\\s*(?:${unitPattern})?\\b)|$)`,
  'giu',
)

export function normalizeText(value) {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function singularizeWord(word) {
  if (word === 'paes') return 'pao'
  if (word.endsWith('oes') && word.length > 4) return `${word.slice(0, -3)}ao`
  if (/[aeiou]s$/.test(word) && word.length > 3) return word.slice(0, -1)
  return word
}

function normalizeFoodName(value) {
  return normalizeText(value)
    .replace(/^[\s:,-]*(?:de|do|da|dos|das)\s+/, '')
    .replace(/\s+(?:no|na)\s+(?:cafe da manha|almoco|jantar|lanche|ceia)\s*$/, '')
    .replace(/[.!?]+$/, '')
    .split(' ')
    .map(singularizeWord)
    .join(' ')
    .trim()
}

function canonicalUnit(rawUnit, rawAmount) {
  const unit = normalizeText(rawUnit || 'unidade').replace(/\.$/, '')
  let amount = Number(String(rawAmount).replace(',', '.'))
  if (unit === 'kg' || unit.startsWith('quilograma')) return { amount: amount * 1000, unit: 'g' }
  if (unit === 'mg' || unit.startsWith('miligrama')) return { amount: amount / 1000, unit: 'g' }
  if (unit.startsWith('grama')) return { amount, unit: 'g' }
  if (unit === 'l' || unit.startsWith('litro')) return { amount: amount * 1000, unit: 'ml' }
  if (unit.startsWith('mililitro')) return { amount, unit: 'ml' }
  if (unit.startsWith('unid')) return { amount, unit: 'unidade' }
  if (unit.startsWith('fatia')) return { amount, unit: 'fatia' }
  if (unit.startsWith('colher')) return { amount, unit: unit.includes('cha') ? 'colher-cha' : 'colher-sopa' }
  if (unit.startsWith('xicara')) return { amount, unit: 'xicara' }
  if (unit.startsWith('copo')) return { amount, unit: 'copo' }
  if (unit.startsWith('prato')) return { amount, unit: 'prato' }
  if (unit.startsWith('scoop')) return { amount, unit: 'scoop' }
  if (unit.startsWith('pote')) return { amount, unit: 'pote' }
  if (unit.startsWith('porcao')) return { amount, unit: 'porcao' }
  return { amount, unit: unit || 'unidade' }
}

function printableAmount(amount) {
  return Number(amount.toFixed(3)).toString()
}

export function extractFoodPortions(description) {
  const normalized = normalizeText(description)
    .replace(/\b(?:eu\s+)?(?:comi|consumi|ingeri|tomei)\b\s*/g, '')
  const portions = []
  portionRegex.lastIndex = 0
  for (const match of normalized.matchAll(portionRegex)) {
    const name = normalizeFoodName(match[3])
    if (!name || name.length < 2) continue
    const { amount, unit } = canonicalUnit(match[2], match[1])
    if (!Number.isFinite(amount) || amount <= 0) continue
    portions.push({ amount: Number(printableAmount(amount)), unit, name })
  }
  return portions
}

function fallbackDescription(description) {
  return normalizeText(description)
    .replace(/\b(?:eu\s+)?(?:comi|consumi|ingeri|tomei)\b\s*/g, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

export function createCanonicalFoodKey(description) {
  const portions = extractFoodPortions(description)
  const canonical = portions.length
    ? portions
      .map(item => `${printableAmount(item.amount)}${item.unit}:${item.name}`)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .join('|')
    : fallbackDescription(description)
  const key = createHash('sha256').update(`food-cache-v${CACHE_SCHEMA_VERSION}:${canonical}`).digest('hex')
  return { key, canonical, portions, strategy: portions.length ? 'portions' : 'description' }
}

function createItemKey(name, unit) {
  return createHash('sha256').update(`food-item-v${CACHE_SCHEMA_VERSION}:${unit}:${name}`).digest('hex')
}

function lowestConfidence(values) {
  const rank = { low: 0, medium: 1, high: 2 }
  return values.reduce((lowest, current) => rank[current] < rank[lowest] ? current : lowest, 'high')
}

export function createFoodCache(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new Database(databasePath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS food_estimate_cache (
      cache_key TEXT PRIMARY KEY,
      canonical_text TEXT NOT NULL,
      original_description TEXT NOT NULL,
      response_json TEXT NOT NULL,
      source_model TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_food_cache_last_used ON food_estimate_cache(last_used_at);
    CREATE TABLE IF NOT EXISTS food_item_cache (
      item_key TEXT PRIMARY KEY,
      normalized_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      base_amount REAL NOT NULL,
      base_calories REAL NOT NULL,
      base_protein REAL NOT NULL DEFAULT 0,
      base_carbs REAL NOT NULL DEFAULT 0,
      base_fat REAL NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL,
      source_model TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_food_item_name_unit ON food_item_cache(normalized_name, unit);
    CREATE TABLE IF NOT EXISTS food_cache_metrics (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO food_cache_metrics(name, value) VALUES ('saved_requests', 0);
  `)
  const itemColumns = new Set(db.prepare('PRAGMA table_info(food_item_cache)').all().map(column => column.name))
  if (!itemColumns.has('base_protein')) db.exec('ALTER TABLE food_item_cache ADD COLUMN base_protein REAL NOT NULL DEFAULT 0')
  if (!itemColumns.has('base_carbs')) db.exec('ALTER TABLE food_item_cache ADD COLUMN base_carbs REAL NOT NULL DEFAULT 0')
  if (!itemColumns.has('base_fat')) db.exec('ALTER TABLE food_item_cache ADD COLUMN base_fat REAL NOT NULL DEFAULT 0')

  const select = db.prepare('SELECT * FROM food_estimate_cache WHERE cache_key = ? AND schema_version = ?')
  const touch = db.prepare('UPDATE food_estimate_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE cache_key = ?')
  const upsert = db.prepare(`
    INSERT INTO food_estimate_cache (
      cache_key, canonical_text, original_description, response_json, source_model, schema_version
    ) VALUES (@key, @canonical, @description, @responseJson, @model, @schemaVersion)
    ON CONFLICT(cache_key) DO UPDATE SET
      response_json = excluded.response_json,
      source_model = excluded.source_model,
      updated_at = CURRENT_TIMESTAMP
  `)
  const stats = db.prepare(`
    SELECT COUNT(*) AS entries, COALESCE(SUM(hit_count), 0) AS hits,
      MAX(created_at) AS newest_entry, MAX(last_used_at) AS last_hit
    FROM food_estimate_cache WHERE schema_version = ?
  `)
  const selectItem = db.prepare('SELECT * FROM food_item_cache WHERE item_key = ?')
  const touchItem = db.prepare('UPDATE food_item_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE item_key = ?')
  const upsertItem = db.prepare(`
    INSERT INTO food_item_cache (
      item_key, normalized_name, display_name, unit, base_amount, base_calories, base_protein, base_carbs, base_fat, confidence, source_model
    ) VALUES (@key, @name, @displayName, @unit, @amount, @calories, @protein, @carbs, @fat, @confidence, @model)
    ON CONFLICT(item_key) DO UPDATE SET
      display_name = excluded.display_name,
      base_amount = excluded.base_amount,
      base_calories = excluded.base_calories,
      base_protein = excluded.base_protein,
      base_carbs = excluded.base_carbs,
      base_fat = excluded.base_fat,
      confidence = excluded.confidence,
      source_model = excluded.source_model,
      updated_at = CURRENT_TIMESTAMP
  `)
  const itemStats = db.prepare(`
    SELECT COUNT(*) AS entries, COALESCE(SUM(hit_count), 0) AS hits
    FROM food_item_cache
  `)
  const incrementSavedRequests = db.prepare("UPDATE food_cache_metrics SET value = value + 1 WHERE name = 'saved_requests'")
  const savedRequests = db.prepare("SELECT value FROM food_cache_metrics WHERE name = 'saved_requests'")

  function getCompositeFromItems(canonical) {
    if (!canonical.portions.length) return null
    const matches = canonical.portions.map(portion => ({
      portion,
      row: selectItem.get(createItemKey(portion.name, portion.unit)),
    }))
    if (matches.some(match => !match.row)) return null

    for (const match of matches) touchItem.run(match.row.item_key)
    const items = matches.map(({ portion, row }) => {
      const scale = portion.amount / Number(row.base_amount)
      return {
        name: row.display_name,
        quantity: portion.amount,
        unit: portion.unit,
        calories: Math.round(Number(row.base_calories) * scale),
        protein: Math.round(Number(row.base_protein) * scale * 10) / 10,
        carbs: Math.round(Number(row.base_carbs) * scale * 10) / 10,
        fat: Math.round(Number(row.base_fat) * scale * 10) / 10,
      }
    })
    return {
      value: {
        items,
        totalCalories: items.reduce((sum, item) => sum + item.calories, 0),
        confidence: lowestConfidence(matches.map(match => match.row.confidence)),
        note: `Estimativa composta com ${items.length} ${items.length === 1 ? 'alimento salvo' : 'alimentos salvos'} anteriormente.`,
      },
      canonical: { ...canonical, strategy: 'items' },
      hitCount: 1,
      sourceModel: [...new Set(matches.map(match => match.row.source_model))].join(', '),
    }
  }

  const saveItems = db.transaction((canonical, value, sourceModel) => {
    if (!canonical.portions.length || canonical.portions.length !== value.items?.length) return
    canonical.portions.forEach((portion, index) => {
      const item = value.items[index]
      if (![item?.calories, item?.protein, item?.carbs, item?.fat].every(value => Number.isFinite(value) && value >= 0)) return
      upsertItem.run({
        key: createItemKey(portion.name, portion.unit),
        name: portion.name,
        displayName: item.name,
        unit: portion.unit,
        amount: portion.amount,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        confidence: value.confidence,
        model: sourceModel,
      })
    })
  })

  // Preenche o cache por alimento para registros criados antes dessa tabela existir.
  const legacyMeals = db.prepare(`
    SELECT original_description, response_json, source_model
    FROM food_estimate_cache WHERE schema_version = ?
  `).all(CACHE_SCHEMA_VERSION)
  for (const meal of legacyMeals) {
    try {
      saveItems(createCanonicalFoodKey(meal.original_description), JSON.parse(meal.response_json), meal.source_model)
    } catch {
      // Um registro antigo inválido não deve impedir a inicialização da API.
    }
  }

  return {
    get(description) {
      const canonical = createCanonicalFoodKey(description)
      const row = select.get(canonical.key, CACHE_SCHEMA_VERSION)
      let result
      if (row) {
        touch.run(canonical.key)
        result = {
          value: JSON.parse(row.response_json),
          canonical,
          hitCount: Number(row.hit_count) + 1,
          sourceModel: row.source_model,
        }
      } else {
        result = getCompositeFromItems(canonical)
      }
      if (result) incrementSavedRequests.run()
      return result
    },
    set(description, value, sourceModel) {
      const canonical = createCanonicalFoodKey(description)
      upsert.run({
        key: canonical.key,
        canonical: canonical.canonical,
        description,
        responseJson: JSON.stringify(value),
        model: sourceModel,
        schemaVersion: CACHE_SCHEMA_VERSION,
      })
      saveItems(canonical, value, sourceModel)
      return canonical
    },
    stats() {
      const row = stats.get(CACHE_SCHEMA_VERSION)
      const foods = itemStats.get()
      return {
        ...row,
        entries: Number(row.entries),
        hits: Number(row.hits),
        itemEntries: Number(foods.entries),
        itemHits: Number(foods.hits),
        savedRequests: Number(savedRequests.get().value),
        schemaVersion: CACHE_SCHEMA_VERSION,
      }
    },
    close() { db.close() },
  }
}
