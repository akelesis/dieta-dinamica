import OpenAI from 'npm:openai@6.47.0'
import { zodTextFormat } from 'npm:openai@6.47.0/helpers/zod'
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'
import { z } from 'npm:zod@4.4.3'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const Ingredient = z.object({
  name: z.string().min(2).max(100), quantity: z.number().positive(),
  unit: z.enum(['g', 'ml', 'unidade', 'fatia', 'colher de sopa', 'colher de chá', 'xícara', 'pote']),
  householdMeasure: z.string().min(2).max(80), calories: z.number().int().nonnegative(),
})
const MealBase = z.object({
  title: z.string().min(3).max(120), ingredients: z.array(Ingredient).min(2).max(10),
  preparation: z.string().min(10).max(350), calories: z.number().int().positive(),
  protein: z.number().int().nonnegative(), carbs: z.number().int().nonnegative(), fat: z.number().int().nonnegative(),
})
const CurrentMeal = MealBase.extend({ label: z.string().min(2).max(50), time: z.string().regex(/^\d{2}:\d{2}$/) })
const SwapOutput = z.object({ suggestions: z.array(MealBase).length(3) })
const RequestInput = z.object({
  meal: CurrentMeal,
  profile: z.object({ goal: z.enum(['lose', 'maintain', 'gain']), weight: z.number().min(30).max(400) }),
  preferences: z.object({
    dietaryStyle: z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian']),
    restrictions: z.array(z.string()).max(20), favoriteFoods: z.string().max(500), dislikedFoods: z.string().max(500),
    cookingTime: z.enum(['quick', 'moderate', 'flexible']), budget: z.enum(['economy', 'balanced', 'flexible']),
    healthConditions: z.array(z.enum(['diabetes', 'hypertension', 'kidney_disease', 'liver_disease', 'heart_disease', 'other'])).max(6).optional().default([]),
  }),
})

function secretKey() {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined }
  catch { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }
}

function normalizeSuggestion(suggestion: z.infer<typeof MealBase>, target: number) {
  const current = suggestion.ingredients.reduce((sum, item) => sum + item.calories, 0)
  const scalable = new Set(['g', 'ml', 'colher de sopa', 'colher de chá', 'xícara'])
  const scalableCalories = suggestion.ingredients.filter(item => scalable.has(item.unit)).reduce((sum, item) => sum + item.calories, 0)
  const fixedCalories = current - scalableCalories
  const factor = scalableCalories > 0 ? (target - fixedCalories) / scalableCalories : 1
  const shouldFit = Math.abs(current - target) > target * .05 && factor >= .65 && factor <= 1.35
  const ingredients = suggestion.ingredients.map(item => {
    if (!shouldFit || !scalable.has(item.unit)) return item
    const raw = item.quantity * factor
    const quantity = ['g', 'ml'].includes(item.unit) && raw >= 20 ? Math.max(5, Math.round(raw / 5) * 5) : Math.max(.25, Math.round(raw * 4) / 4)
    return { ...item, quantity, calories: Math.max(0, Math.round(item.calories * factor)) }
  })
  const calories = ingredients.reduce((sum, item) => sum + item.calories, 0)
  const macroFactor = current > 0 ? calories / current : 1
  return { ...suggestion, ingredients, calories, protein: Math.round(suggestion.protein * macroFactor), carbs: Math.round(suggestion.carbs * macroFactor), fat: Math.round(suggestion.fat * macroFactor) }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const auth = token ? await admin.auth.getUser(token) : null
  if (!auth?.data.user || auth.error) return json({ error: 'UNAUTHORIZED', message: 'Entre na sua conta para gerar trocas.' }, 401)
  const [{ data: billing }, { data: entitlement }] = await Promise.all([
    admin.from('billing_configuration').select('enabled').eq('singleton', true).maybeSingle(),
    admin.from('subscriptions').select('status, plan_mode').eq('user_id', auth.data.user.id).maybeSingle(),
  ])
  if (billing?.enabled && (!entitlement || !['active', 'trialing'].includes(entitlement.status) || entitlement.plan_mode !== 'guided')) {
    return json({ error: 'SUBSCRIPTION_REQUIRED', message: 'As trocas por IA requerem o plano personalizado ativo.' }, 402)
  }

  const parsed = RequestInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'INVALID_INPUT', message: 'A refeição não possui dados suficientes para gerar trocas.' }, 400)
  const { meal, profile, preferences } = parsed.data
  if (preferences.healthConditions.includes('kidney_disease')) return json({ error: 'CLINICAL_REVIEW_REQUIRED', message: 'Trocas automáticas ficam desativadas para doença renal sem revisão profissional.' }, 422)
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return json({ error: 'OPENAI_NOT_CONFIGURED' }, 503)

  try {
    const result = await new OpenAI({ apiKey }).responses.parse({
      model: Deno.env.get('OPENAI_PLAN_MODEL') || 'gpt-5.4-mini',
      input: [
        { role: 'system', content: `Crie exatamente 3 alternativas brasileiras completas para substituir uma única refeição. Cada alternativa deve ser um prato real e diferente da refeição atual e das outras sugestões. Mantenha as calorias em até 5% para mais ou para menos da refeição atual e macros semelhantes. Informe quantidade exata, medida caseira, calorias de cada ingrediente e preparo. Respeite integralmente estilo, restrições e alimentos evitados. Nunca use listas vagas com "ou". Nunca coloque ovos e aveia juntos; aveia deve estar preparada com líquido, iogurte ou fruta. Use ingredientes comuns e respeite orçamento e tempo de preparo. Português do Brasil.` },
        { role: 'user', content: JSON.stringify({ refeicaoAtual: meal, objetivo: profile.goal, pesoKg: profile.weight, preferencias: preferences }) },
      ],
      max_output_tokens: 4500,
      text: { format: zodTextFormat(SwapOutput, 'meal_swap_suggestions') },
    })
    if (!result.output_parsed) return json({ error: 'NO_SWAPS', message: 'Não foi possível estruturar sugestões de troca.' }, 422)
    const suggestions = result.output_parsed.suggestions.map(suggestion => normalizeSuggestion(suggestion, meal.calories))
      .filter(suggestion => {
        const foods = suggestion.ingredients.map(item => item.name.toLocaleLowerCase('pt-BR')).join(' ')
        return !(foods.includes('aveia') && /\bovo(?:s)?\b/.test(foods))
      })
    const minimum = Math.ceil(meal.calories * .95)
    const maximum = Math.floor(meal.calories * 1.05)
    const validatedSuggestions = suggestions.filter(suggestion => suggestion.calories >= minimum && suggestion.calories <= maximum)
    if (validatedSuggestions.length !== 3) return json({ error: 'SWAP_QUALITY_FAILED', message: 'As sugestões não passaram na validação de coerência e calorias. Tente novamente.' }, 422)
    return json({ suggestions: validatedSuggestions })
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500
    return json({ error: 'SWAPS_FAILED', message: status === 429 ? 'O limite temporário da IA foi atingido.' : 'Não foi possível gerar as trocas agora.' }, status >= 400 && status < 600 ? status : 500)
  }
})
