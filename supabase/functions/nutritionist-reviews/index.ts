import OpenAI from 'npm:openai@6.47.0'
import { zodTextFormat } from 'npm:openai@6.47.0/helpers/zod'
import { z } from 'npm:zod@4.4.3'
import { adminClient, authenticatedUser, corsHeaders, json } from '../_shared/billing.ts'

const Ingredient = z.object({
  name: z.string().min(2).max(100), quantity: z.number().positive(),
  unit: z.enum(['g', 'ml', 'unidade', 'fatia', 'colher de sopa', 'colher de chá', 'xícara', 'pote']),
  householdMeasure: z.string().min(1).max(100), calories: z.number().int().nonnegative(),
})
const Meal = z.object({
  label: z.string().min(2).max(50), time: z.string().regex(/^\d{2}:\d{2}$/), title: z.string().min(3).max(120),
  ingredients: z.array(Ingredient).min(1).max(15), calories: z.number().int().nonnegative(),
  protein: z.number().int().nonnegative(), carbs: z.number().int().nonnegative(), fat: z.number().int().nonnegative(),
})
const MenuOption = z.object({
  id: z.enum(['A', 'B', 'C']), label: z.string().min(3).max(30),
  dailyCalories: z.number().int().nonnegative(), protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(), fat: z.number().int().nonnegative(),
  meals: z.array(Meal).min(1).max(8),
})
const Plan = z.object({
  summary: z.string().min(5).max(500), dailyCalories: z.number().int().nonnegative(),
  protein: z.number().int().nonnegative(), carbs: z.number().int().nonnegative(), fat: z.number().int().nonnegative(),
  menus: z.array(MenuOption).min(1).max(3), dailyGuidance: z.array(z.string().min(3).max(220)).max(6),
})
const RequestInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('get'), reviewId: z.string().uuid() }),
  z.object({ action: z.literal('save'), reviewId: z.string().uuid(), plan: Plan }),
  z.object({ action: z.literal('approve'), reviewId: z.string().uuid(), plan: Plan }),
])
const PreparationOutput = z.object({
  meals: z.array(z.object({ menuId: z.enum(['A', 'B', 'C']), mealIndex: z.number().int().nonnegative(), preparation: z.string().min(10).max(600) })),
})

function normalizePlan(input: z.infer<typeof Plan>) {
  const ids = ['A', 'B', 'C'] as const
  const menus = input.menus.map((menu, index) => {
    const meals = menu.meals.map(meal => ({
      ...meal,
      preparation: undefined,
      calories: meal.ingredients.reduce((sum, item) => sum + item.calories, 0),
    }))
    return {
      ...menu,
      id: ids[index],
      label: `Cardápio ${ids[index]}`,
      meals,
      dailyCalories: meals.reduce((sum, meal) => sum + meal.calories, 0),
      protein: meals.reduce((sum, meal) => sum + meal.protein, 0),
      carbs: meals.reduce((sum, meal) => sum + meal.carbs, 0),
      fat: meals.reduce((sum, meal) => sum + meal.fat, 0),
    }
  })
  const divisor = Math.max(1, menus.length)
  return {
    ...input,
    menus,
    dailyCalories: Math.round(menus.reduce((sum, menu) => sum + menu.dailyCalories, 0) / divisor),
    protein: Math.round(menus.reduce((sum, menu) => sum + menu.protein, 0) / divisor),
    carbs: Math.round(menus.reduce((sum, menu) => sum + menu.carbs, 0) / divisor),
    fat: Math.round(menus.reduce((sum, menu) => sum + menu.fat, 0) / divisor),
  }
}

function publicReview(row: Record<string, unknown>) {
  return {
    id: row.id,
    caseCode: `CASO-${String(row.id).slice(0, 8).toUpperCase()}`,
    status: row.status,
    context: row.context_snapshot,
    plan: row.status === 'approved' ? row.approved_plan : row.draft_plan,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const user = await authenticatedUser(request)
    if (!user) return json(request, { error: 'UNAUTHORIZED', message: 'Entre com uma conta de nutricionista.' }, 401)
    const admin = adminClient()
    const { data: nutritionist } = await admin.from('nutritionist_accounts').select('user_id').eq('user_id', user.id).eq('active', true).maybeSingle()
    if (!nutritionist) return json(request, { error: 'FORBIDDEN', message: 'Esta conta não possui acesso ao painel profissional.' }, 403)
    const parsed = RequestInput.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json(request, { error: 'INVALID_INPUT', message: 'Solicitação de revisão inválida.' }, 400)

    if (parsed.data.action === 'list') {
      const { data, error } = await admin.from('diet_reviews')
        .select('id, status, context_snapshot, draft_plan, approved_plan, submitted_at, updated_at, reviewed_at')
        .in('status', ['pending', 'in_review']).order('submitted_at', { ascending: true })
      if (error) throw error
      return json(request, { reviews: (data || []).map(row => publicReview(row)) })
    }

    const { data: row, error: findError } = await admin.from('diet_reviews').select('*').eq('id', parsed.data.reviewId).maybeSingle()
    if (findError) throw findError
    if (!row) return json(request, { error: 'NOT_FOUND', message: 'Revisão não encontrada.' }, 404)

    if (parsed.data.action === 'get') {
      if (row.status === 'pending') await admin.from('diet_reviews').update({ status: 'in_review', reviewer_id: user.id, claimed_at: new Date().toISOString() }).eq('id', row.id)
      return json(request, { review: publicReview({ ...row, status: row.status === 'pending' ? 'in_review' : row.status }) })
    }
    if (row.status === 'approved') return json(request, { error: 'ALREADY_APPROVED', message: 'Esta dieta já foi aprovada.' }, 409)
    const plan = normalizePlan(parsed.data.plan)

    if (parsed.data.action === 'save') {
      const { data, error } = await admin.from('diet_reviews').update({ draft_plan: plan, status: 'in_review', reviewer_id: user.id, claimed_at: row.claimed_at || new Date().toISOString() }).eq('id', row.id).select('*').single()
      if (error) throw error
      return json(request, { review: publicReview(data) })
    }

    if (plan.menus.length !== 3) {
      return json(request, { error: 'THREE_MENUS_REQUIRED', message: 'A dieta precisa conter os cardápios A, B e C antes da aprovação.' }, 422)
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json(request, { error: 'OPENAI_NOT_CONFIGURED', message: 'A geração de preparos não está configurada.' }, 503)
    const model = Deno.env.get('OPENAI_PLAN_MODEL') || 'gpt-5.4-mini'
    const result = await new OpenAI({ apiKey }).responses.parse({
      model,
      input: [
        { role: 'system', content: 'Escreva o modo de preparo de cada refeição usando somente os ingredientes e quantidades confirmados pelo nutricionista. Não adicione, remova nem substitua ingredientes. Seja direto, seguro e escreva em português do Brasil.' },
        { role: 'user', content: JSON.stringify(plan.menus.flatMap(menu => menu.meals.map((meal, mealIndex) => ({ menuId: menu.id, mealIndex, title: meal.title, ingredients: meal.ingredients })))) },
      ],
      max_output_tokens: 7000,
      text: { format: zodTextFormat(PreparationOutput, 'confirmed_meal_preparations') },
    })
    const preparations = result.output_parsed?.meals || []
    const mealCount = plan.menus.reduce((sum, menu) => sum + menu.meals.length, 0)
    if (preparations.length !== mealCount) return json(request, { error: 'PREPARATION_FAILED', message: 'A IA não retornou todos os modos de preparo.' }, 422)
    const preparationMap = new Map(preparations.map(item => [`${item.menuId}:${item.mealIndex}`, item.preparation]))
    const approvedPlan = { ...plan, menus: plan.menus.map(menu => ({ ...menu, meals: menu.meals.map((meal, mealIndex) => ({ ...meal, preparation: preparationMap.get(`${menu.id}:${mealIndex}`) || '' })) })) }
    if (approvedPlan.menus.some(menu => menu.meals.some(meal => !meal.preparation))) return json(request, { error: 'PREPARATION_FAILED', message: 'Há refeições sem modo de preparo.' }, 422)
    const reviewedAt = new Date().toISOString()
    const { error: updateError } = await admin.from('diet_reviews').update({
      draft_plan: plan, approved_plan: approvedPlan, status: 'approved', reviewer_id: user.id,
      reviewed_at: reviewedAt, preparation_model: model,
    }).eq('id', row.id)
    if (updateError) throw updateError
    const { error: publishError } = await admin.from('generated_plans').upsert({
      user_id: row.user_id, input_hash: row.input_hash, plan_json: approvedPlan,
      source_model: row.source_model, prompt_version: 9, updated_at: reviewedAt,
    })
    if (publishError) throw publishError
    return json(request, { review: publicReview({ ...row, draft_plan: plan, approved_plan: approvedPlan, status: 'approved', reviewed_at: reviewedAt, updated_at: reviewedAt }) })
  } catch (error) {
    console.error('nutritionist-reviews', error)
    return json(request, { error: 'REVIEW_FAILED', message: 'Não foi possível concluir a revisão agora.' }, 500)
  }
})
