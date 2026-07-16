import OpenAI from 'npm:openai@6.47.0'
import { zodTextFormat } from 'npm:openai@6.47.0/helpers/zod'
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'
import { z } from 'npm:zod@4.4.3'
import { CACHE_SCHEMA_VERSION, canonicalFoodKey, itemKey } from '../_shared/food-normalizer.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const FoodEstimate = z.object({
  items: z.array(z.object({
    name: z.string(), quantity: z.number().positive(), unit: z.string(), calories: z.number().nonnegative(),
    protein: z.number().nonnegative(), carbs: z.number().nonnegative(), fat: z.number().nonnegative(),
  })).max(20),
  totalCalories: z.number().nonnegative(), confidence: z.enum(['low', 'medium', 'high']), note: z.string(),
})

function secretKey() {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined } catch { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }
}

type CommonFoodRow = {
  food_key: string
  display_name: string
  aliases: string[]
  kcal_per_100g: number | string
  protein_per_100g: number | string
  carbs_per_100g: number | string
  fat_per_100g: number | string
  source_name: string
}

const roundMacro = (value: number) => Math.round(value * 10) / 10

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!token || (await admin.auth.getUser(token)).error) return json({ error: 'UNAUTHORIZED', message: 'Entre na sua conta para analisar alimentos.' }, 401)

  const body = await request.json().catch(() => ({}))
  const description = body && typeof body === 'object' && 'description' in body ? body.description : ''
  if (typeof description !== 'string' || description.trim().length < 3 || description.length > 1000) return json({ error: 'INVALID_DESCRIPTION', message: 'Descreva a refeição em até 1.000 caracteres.' }, 400)

  const canonical = await canonicalFoodKey(description.trim())
  const { data: cached } = await admin.from('food_estimate_cache').select('response_json,source_model').eq('cache_key', canonical.key).eq('schema_version', CACHE_SCHEMA_VERSION).maybeSingle()
  if (cached) {
    const { data: hits } = await admin.rpc('record_food_cache_hit', { p_cache_key: canonical.key })
    return json({ ...cached.response_json, model: cached.source_model, cached: true, cache: { hit: true, hitCount: hits || 1, strategy: canonical.strategy } })
  }

  if (canonical.portions.length) {
    const keys = await Promise.all(canonical.portions.map(portion => itemKey(portion.name, portion.unit)))
    const [{ data: storedItems }, { data: commonFoods }] = await Promise.all([
      admin.from('food_item_cache').select('*').in('item_key', keys),
      admin.from('common_foods').select('food_key,display_name,aliases,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,source_name'),
    ])
    const storedByKey = new Map((storedItems || []).map(item => [item.item_key, item]))
    const commonByAlias = new Map<string, CommonFoodRow>()
    for (const food of (commonFoods || []) as CommonFoodRow[]) for (const alias of food.aliases) commonByAlias.set(alias, food)

    const matches = canonical.portions.map((portion, index) => {
      const common = portion.unit === 'g' ? commonByAlias.get(portion.name) : undefined
      if (common) {
        const scale = portion.amount / 100
        return {
          source: 'taco' as const,
          key: common.food_key,
          item: {
            name: common.display_name, quantity: portion.amount, unit: portion.unit,
            calories: Math.round(Number(common.kcal_per_100g) * scale),
            protein: roundMacro(Number(common.protein_per_100g) * scale),
            carbs: roundMacro(Number(common.carbs_per_100g) * scale),
            fat: roundMacro(Number(common.fat_per_100g) * scale),
          },
        }
      }
      const stored = storedByKey.get(keys[index])
      if (!stored) return null
      const scale = portion.amount / Number(stored.base_amount)
      return {
        source: 'cache' as const,
        key: stored.item_key,
        item: {
          name: stored.display_name, quantity: portion.amount, unit: portion.unit,
          calories: Math.round(Number(stored.base_calories) * scale),
          protein: roundMacro(Number(stored.base_protein) * scale),
          carbs: roundMacro(Number(stored.base_carbs) * scale),
          fat: roundMacro(Number(stored.base_fat) * scale),
        },
      }
    })

    if (matches.every(Boolean)) {
      const resolved = matches.filter((match): match is NonNullable<typeof match> => Boolean(match))
      const items = resolved.map(match => match.item)
      const cachedKeys = resolved.filter(match => match.source === 'cache').map(match => match.key)
      const tacoKeys = resolved.filter(match => match.source === 'taco').map(match => match.key)
      if (tacoKeys.length) await admin.rpc('record_common_food_hits', { p_food_keys: tacoKeys })
      else if (cachedKeys.length) await admin.rpc('record_food_item_hits', { p_item_keys: cachedKeys })
      const usesTaco = resolved.some(match => match.source === 'taco')
      const onlyTaco = resolved.every(match => match.source === 'taco')
      return json({
        items,
        totalCalories: items.reduce((sum, item) => sum + item.calories, 0),
        confidence: onlyTaco ? 'high' : 'medium',
        note: onlyTaco ? 'Cálculo proporcional à quantidade informada, usando valores por 100 g da TACO/Unicamp.' : 'Cálculo composto com a TACO/Unicamp e alimentos já salvos.',
        model: usesTaco ? 'TACO 4ª edição' : 'cache',
        cached: true,
        cache: { hit: true, hitCount: 1, strategy: usesTaco ? 'taco' : 'items' },
      })
    }
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return json({ error: 'OPENAI_NOT_CONFIGURED', message: 'OPENAI_API_KEY não configurada na Edge Function.' }, 503)
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6'

  try {
    const result = await new OpenAI({ apiKey }).responses.parse({
      model,
      input: [
        { role: 'system', content: 'Você estima calorias e macronutrientes de refeições em português do Brasil. Extraia cada alimento, quantidade e unidade. Para cada item, informe calorias, proteína, carboidratos e gorduras em gramas. Considere porções brasileiras. Quando houver dúvida, use porção típica e reduza a confiança. Calorias são inteiros aproximados e a soma deve ser totalCalories. Os macros devem ser números não negativos e nutricionalmente coerentes. A nota explica brevemente a principal suposição.' },
        { role: 'user', content: description.trim() },
      ],
      text: { format: zodTextFormat(FoodEstimate, 'food_estimate') },
    })
    if (!result.output_parsed) return json({ error: 'NO_ESTIMATE' }, 422)
    const value = result.output_parsed
    await admin.from('food_estimate_cache').upsert({ cache_key: canonical.key, canonical_text: canonical.canonical, original_description: description.trim(), response_json: value, source_model: model, schema_version: CACHE_SCHEMA_VERSION })
    if (canonical.portions.length === value.items.length) {
      await admin.from('food_item_cache').upsert(await Promise.all(canonical.portions.map(async (portion, index) => ({
        item_key: await itemKey(portion.name, portion.unit), normalized_name: portion.name, display_name: value.items[index].name,
        unit: portion.unit, base_amount: portion.amount, base_calories: value.items[index].calories,
        base_protein: value.items[index].protein, base_carbs: value.items[index].carbs, base_fat: value.items[index].fat,
        confidence: value.confidence, source_model: model,
      }))))
    }
    return json({ ...value, model, cached: false, cache: { hit: false, hitCount: 0, strategy: canonical.strategy } })
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500
    return json({ error: 'OPENAI_REQUEST_FAILED', message: status === 429 ? 'Limite temporário da OpenAI atingido.' : 'Não foi possível consultar a OpenAI agora.' }, status >= 400 && status < 600 ? status : 500)
  }
})
