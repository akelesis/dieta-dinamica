import type { FoodBreakdown, MealEntry, NutritionPlan, Profile } from '../types'

const goalAdjustments = { lose: -350, maintain: 0, gain: 300 }
const intensityMet = { light: 3.8, moderate: 5.8, intense: 7.5 }
const dailyActivityFactors = { sedentary: 1.2, light: 1.25, active: 1.4, heavy: 1.55 }

export function calculatePlan(profile: Profile): NutritionPlan {
  const sexOffset = profile.sex === 'male' ? 5 : -161
  const bmr = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * profile.age + sexOffset)
  const activityFactor = dailyActivityFactors[profile.dailyActivity || 'light']
  const restTarget = Math.max(1200, Math.round((bmr * activityFactor + goalAdjustments[profile.goal]) / 10) * 10)
  const rawBurn = intensityMet[profile.intensity] * profile.weight * (profile.workoutMinutes / 60)
  const workoutBonus = Math.round((rawBurn * 0.75) / 10) * 10
  const activeTarget = restTarget + workoutBonus
  const proteinPerKg = profile.goal === 'gain' ? 2 : profile.goal === 'lose' ? 1.8 : 1.6
  const protein = Math.round(profile.weight * proteinPerKg)
  const fat = Math.round(profile.weight * 0.8)
  const carbs = Math.max(0, Math.round((restTarget - protein * 4 - fat * 9) / 4))

  return {
    bmr,
    restTarget,
    activeTarget,
    workoutBonus,
    protein,
    carbs,
    fat,
    water: Math.round(profile.weight * 35 / 100) / 10,
  }
}

type Food = {
  name: string
  aliases: string[]
  calories: number
  defaultQuantity: number
  unit: string
  perGrams?: number
}

const foods: Food[] = [
  { name: 'Uva encapada', aliases: ['uvas encapadas', 'uva encapada', 'uva surpresa'], calories: 76, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Uva', aliases: ['uvas', 'uva'], calories: 3.5, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Banana', aliases: ['bananas', 'banana'], calories: 89, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Maçã', aliases: ['macas', 'maca', 'maçãs', 'maçã'], calories: 72, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Ovo', aliases: ['ovos', 'ovo'], calories: 72, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Pão francês', aliases: ['paes franceses', 'pao frances', 'pães franceses', 'pão francês'], calories: 135, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Pão de queijo', aliases: ['paes de queijo', 'pao de queijo', 'pães de queijo', 'pão de queijo'], calories: 90, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Arroz cozido', aliases: ['arroz cozido', 'arroz'], calories: 130, defaultQuantity: 100, unit: 'g', perGrams: 100 },
  { name: 'Feijão cozido', aliases: ['feijao cozido', 'feijao', 'feijão cozido', 'feijão'], calories: 76, defaultQuantity: 100, unit: 'g', perGrams: 100 },
  { name: 'Peito de frango', aliases: ['peito de frango', 'frango grelhado', 'frango'], calories: 165, defaultQuantity: 100, unit: 'g', perGrams: 100 },
  { name: 'Carne bovina', aliases: ['carne bovina', 'bife', 'carne'], calories: 250, defaultQuantity: 100, unit: 'g', perGrams: 100 },
  { name: 'Batata-doce', aliases: ['batata doce', 'batata-doce'], calories: 86, defaultQuantity: 100, unit: 'g', perGrams: 100 },
  { name: 'Aveia', aliases: ['aveia'], calories: 117, defaultQuantity: 30, unit: 'g', perGrams: 30 },
  { name: 'Iogurte natural', aliases: ['iogurte natural', 'iogurte'], calories: 120, defaultQuantity: 1, unit: 'pote' },
  { name: 'Leite integral', aliases: ['leite integral', 'leite'], calories: 122, defaultQuantity: 200, unit: 'ml', perGrams: 200 },
  { name: 'Queijo muçarela', aliases: ['queijo mucarela', 'mucarela', 'queijo muçarela', 'muçarela'], calories: 85, defaultQuantity: 1, unit: 'fatia' },
  { name: 'Café com açúcar', aliases: ['cafe com acucar', 'café com açúcar'], calories: 35, defaultQuantity: 1, unit: 'xícara' },
  { name: 'Café sem açúcar', aliases: ['cafe sem acucar', 'cafe', 'café sem açúcar', 'café'], calories: 3, defaultQuantity: 1, unit: 'xícara' },
  { name: 'Whey protein', aliases: ['whey protein', 'whey'], calories: 120, defaultQuantity: 1, unit: 'scoop' },
  { name: 'Chocolate', aliases: ['chocolate'], calories: 107, defaultQuantity: 20, unit: 'g', perGrams: 20 },
  { name: 'Brigadeiro', aliases: ['brigadeiros', 'brigadeiro'], calories: 90, defaultQuantity: 1, unit: 'unidade' },
  { name: 'Tapioca', aliases: ['tapioca'], calories: 173, defaultQuantity: 1, unit: 'unidade' },
]

function inferMacros(name: string, calories: number) {
  const food = normalize(name)
  let ratios: [number, number, number]
  if (/margarina|manteiga|azeite|óleo|oleo|maionese|bacon|castanha|amendoim|paçoca|pacoca/.test(food)) ratios = [.1, .1, .8]
  else if (/frango|carne|bife|peixe|atum|sardinha|ovo|whey|filé|file/.test(food)) ratios = [.48, .04, .48]
  else if (/queijo|muçarela|mucarela|requeij|iogurte|leite|cappuccino/.test(food)) ratios = [.25, .25, .5]
  else if (/feijão|feijao|lentilha|grão-de-bico|grao-de-bico|ervilha/.test(food)) ratios = [.24, .7, .06]
  else if (/arroz|pão|pao|brioche|aveia|tapioca|farinha|mandioca|batata|massa|macarrão|macarrao/.test(food)) ratios = [.1, .78, .12]
  else if (/banana|maçã|maca|manga|kiwi|uva|fruta|mel|açúcar|acucar|chocolate|brigadeiro/.test(food)) ratios = [.03, .91, .06]
  else if (/brócolis|brocolis|legume|verdura|salada|cenoura|abobrinha|couve|tomate/.test(food)) ratios = [.2, .7, .1]
  else if (/pizza|sanduíche|sanduiche|hambúrguer|hamburguer|lasanha/.test(food)) ratios = [.2, .45, .35]
  else ratios = [.18, .52, .3]
  return {
    protein: Math.round((calories * ratios[0] / 4) * 10) / 10,
    carbs: Math.round((calories * ratios[1] / 4) * 10) / 10,
    fat: Math.round((calories * ratios[2] / 9) * 10) / 10,
  }
}

export function consumedMacros(entries: MealEntry[]) {
  let estimated = false
  const totals = entries.reduce((day, entry) => {
    const items: FoodBreakdown[] = entry.breakdown.length ? entry.breakdown : [{ name: entry.description, quantity: 1, unit: 'refeição', calories: entry.calories }]
    for (const item of items) {
      const hasSavedMacros = [item.protein, item.carbs, item.fat].every(value => typeof value === 'number' && Number.isFinite(value))
      const macros = hasSavedMacros ? { protein: item.protein!, carbs: item.carbs!, fat: item.fat! } : inferMacros(item.name, item.calories)
      if (!hasSavedMacros) estimated = true
      day.protein += macros.protein
      day.carbs += macros.carbs
      day.fat += macros.fat
    }
    return day
  }, { protein: 0, carbs: 0, fat: 0 })
  return { protein: Math.round(totals.protein), carbs: Math.round(totals.carbs), fat: Math.round(totals.fat), estimated }
}

const numberWords: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
}

function normalize(value: string) { return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

function quantityBefore(text: string, index: number, food: Food): { quantity: number; unit: string } {
  const before = text.slice(Math.max(0, index - 32), index).trim()
  const match = before.match(/(\d+(?:[.,]\d+)?|uma?|duas?|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(g|gramas?|ml|unidades?|fatias?|scoops?|xicaras?|potes?)?\s*$/i)
  if (!match) return { quantity: food.defaultQuantity, unit: food.unit }
  const raw = normalize(match[1]).replace(',', '.')
  const quantity = Number(raw) || numberWords[raw] || food.defaultQuantity
  const explicitUnit = normalize(match[2] || '')
  if (explicitUnit.startsWith('g') || explicitUnit === 'ml') return { quantity, unit: explicitUnit === 'ml' ? 'ml' : 'g' }
  return { quantity, unit: food.unit }
}

export function estimateFood(description: string): FoodBreakdown[] {
  const text = normalize(description)
  const candidates = foods.flatMap(food => food.aliases.map(alias => ({ food, alias: normalize(alias), index: text.indexOf(normalize(alias)) })))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length)

  const used = new Set<string>()
  const results: FoodBreakdown[] = []
  for (const candidate of candidates) {
    if (used.has(candidate.food.name)) continue
    const overlaps = candidates.some(other => other !== candidate && other.index === candidate.index && other.alias.length > candidate.alias.length)
    if (overlaps) continue
    const { quantity, unit } = quantityBefore(text, candidate.index, candidate.food)
    const scaled = candidate.food.perGrams ? candidate.food.calories * quantity / candidate.food.perGrams : candidate.food.calories * quantity
    const calories = Math.round(scaled)
    results.push({ name: candidate.food.name, quantity, unit, calories, ...inferMacros(candidate.food.name, calories) })
    used.add(candidate.food.name)
  }
  return results
}

export function mealTypeForHour(time: string) {
  const hour = Number(time.split(':')[0])
  if (hour < 10) return 'Café da manhã'
  if (hour < 12) return 'Lanche da manhã'
  if (hour < 15) return 'Almoço'
  if (hour < 18) return 'Lanche da tarde'
  if (hour < 22) return 'Jantar'
  return 'Ceia'
}

export const goalLabels = { lose: 'Perder peso', maintain: 'Manter o peso', gain: 'Ganhar massa' }
export const intensityLabels = { light: 'Leve', moderate: 'Moderada', intense: 'Intensa' }
export const dailyActivityLabels = { sedentary: 'Maior parte sentado', light: 'Movimento leve', active: 'Ando bastante', heavy: 'Trabalho físico' }
