import OpenAI from 'npm:openai@6.47.0'
import { zodTextFormat } from 'npm:openai@6.47.0/helpers/zod'
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'
import { z } from 'npm:zod@4.4.3'
import { accessForUser } from '../_shared/access.ts'

const PROMPT_VERSION = 11
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

const ProfileInput = z.object({
  name: z.string().min(2).max(100),
  age: z.number().int().min(14).max(100),
  height: z.number().min(100).max(250),
  weight: z.number().min(30).max(400),
  sex: z.enum(['female', 'male']),
  reproductiveStatus: z.enum(['none', 'pregnant_first_trimester', 'pregnant_second_trimester', 'pregnant_third_trimester', 'breastfeeding_0_6_months', 'breastfeeding_7_12_months']).optional().default('none'),
  goal: z.enum(['lose', 'maintain', 'gain']),
  dailyActivity: z.enum(['sedentary', 'light', 'active', 'heavy']),
  workoutsPerWeek: z.number().int().min(0).max(7),
  workoutMinutes: z.number().int().min(0).max(360),
  intensity: z.enum(['light', 'moderate', 'intense']),
})

const PreferencesInput = z.object({
  dietaryStyle: z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian']),
  mealsPerDay: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  restrictions: z.array(z.string().max(80)).max(20),
  favoriteFoods: z.string().max(500),
  dislikedFoods: z.string().max(500),
  cookingTime: z.enum(['quick', 'moderate', 'flexible']),
  budget: z.enum(['economy', 'balanced', 'flexible']),
  breakfastTime: z.string().regex(/^\d{2}:\d{2}$/),
  lunchTime: z.string().regex(/^\d{2}:\d{2}$/),
  dinnerTime: z.string().regex(/^\d{2}:\d{2}$/),
  workoutTime: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal('')]).optional().default(''),
  breakfastAvailability: z.enum(['comfortable', 'limited', 'very_limited']).optional().default('comfortable'),
  lunchAvailability: z.enum(['comfortable', 'limited', 'very_limited']).optional().default('comfortable'),
  dinnerAvailability: z.enum(['comfortable', 'limited', 'very_limited']).optional().default('comfortable'),
  hasHealthCondition: z.boolean(),
  healthConditions: z.array(z.enum(['diabetes', 'hypertension', 'kidney_disease', 'liver_disease', 'heart_disease', 'other'])).max(6).optional().default([]),
})

const RequestInput = z.object({
  profile: ProfileInput,
  preferences: PreferencesInput,
  force: z.boolean().optional().default(false),
})

const Ingredient = z.object({
  name: z.string().min(2).max(100),
  quantity: z.number().positive(),
  unit: z.enum(['g', 'ml', 'unidade', 'fatia', 'colher de sopa', 'colher de chá', 'xícara', 'pote']),
  householdMeasure: z.string().min(2).max(80),
  calories: z.number().int().nonnegative(),
})

const Meal = z.object({
  label: z.string().min(2).max(50),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  title: z.string().min(3).max(120),
  ingredients: z.array(Ingredient).min(2).max(10),
  calories: z.number().int().positive(),
  protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(),
  fat: z.number().int().nonnegative(),
})

const MenuOption = z.object({
  id: z.enum(['A', 'B', 'C']),
  label: z.string().min(3).max(30),
  dailyCalories: z.number().int().positive(),
  protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(),
  fat: z.number().int().nonnegative(),
  meals: z.array(Meal).min(3).max(6),
})

const NutritionPlanOutput = z.object({
  summary: z.string().min(10).max(350),
  dailyCalories: z.number().int().positive(),
  protein: z.number().int().nonnegative(),
  carbs: z.number().int().nonnegative(),
  fat: z.number().int().nonnegative(),
  menus: z.array(MenuOption).length(3),
  dailyGuidance: z.array(z.string().min(5).max(180)).length(3),
})

type Profile = z.infer<typeof ProfileInput>
type Preferences = z.infer<typeof PreferencesInput>

function accessCycleKey(access: Awaited<ReturnType<typeof accessForUser>>) {
  if (access.source === 'subscription') return `stripe:${access.periodEnd || access.periodStart || 'legacy'}`
  const month = new Date().toISOString().slice(0, 7)
  return `${access.source || 'free'}:${month}`
}

function redactNotes(value: string, profileName: string, email?: string) {
  let result = value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[e-mail removido]')
  for (const part of profileName.split(/\s+/).filter(part => part.length >= 3)) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), '[nome removido]')
  }
  if (email) result = result.replaceAll(email, '[e-mail removido]')
  return result
}

function secretKey() {
  try {
    return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined
  } catch {
    return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  }
}

function shiftTime(time: string, minutes: number) {
  const [hours, mins] = time.split(':').map(Number)
  const total = (hours * 60 + mins + minutes) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function minutesFor(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function schedule(preferences: Preferences, profile: Profile) {
  const availability = {
    'Café da manhã': preferences.breakfastAvailability,
    'Almoço': preferences.lunchAvailability,
    'Jantar': preferences.dinnerAvailability,
  } as const
  const all = [
    { label: 'Café da manhã', time: preferences.breakfastTime, availability: availability['Café da manhã'] },
    { label: 'Lanche da manhã', time: shiftTime(preferences.breakfastTime, 150), availability: 'limited' as const },
    { label: 'Almoço', time: preferences.lunchTime, availability: availability['Almoço'] },
    { label: 'Lanche da tarde', time: shiftTime(preferences.lunchTime, 210), availability: 'limited' as const },
    { label: 'Jantar', time: preferences.dinnerTime, availability: availability['Jantar'] },
    { label: 'Ceia', time: shiftTime(preferences.dinnerTime, 150), availability: 'limited' as const },
  ]
  const selected = preferences.mealsPerDay === 6 ? all
    : preferences.mealsPerDay === 5 ? all.filter(item => item.label !== 'Ceia')
      : preferences.mealsPerDay === 4 ? all.filter(item => !['Lanche da manhã', 'Ceia'].includes(item.label))
        : all.filter(item => ['Café da manhã', 'Almoço', 'Jantar'].includes(item.label))

  if (profile.workoutsPerWeek === 0 || !preferences.workoutTime) {
    return selected.map(item => ({ ...item, workoutRelation: 'none' as const }))
  }
  const workout = minutesFor(preferences.workoutTime)
  const times = selected.map(item => minutesFor(item.time))
  let preIndex = -1
  let postIndex = -1
  for (let index = 0; index < times.length; index += 1) {
    if (times[index] < workout && workout - times[index] <= 240) preIndex = index
    if (postIndex === -1 && times[index] > workout && times[index] - workout <= 240) postIndex = index
  }
  return selected.map((item, index) => ({
    ...item,
    workoutRelation: index === preIndex ? 'pre_workout' as const : index === postIndex ? 'post_workout' as const : 'none' as const,
  }))
}

function nutritionFor(profile: Profile) {
  const goalAdjustments = { lose: -350, maintain: 0, gain: 300 }
  const intensityMet = { light: 3.8, moderate: 5.8, intense: 7.5 }
  const dailyActivityFactors = { sedentary: 1.2, light: 1.25, active: 1.4, heavy: 1.55 }
  const reproductiveCalorieAdjustments = { none: 0, pregnant_first_trimester: 0, pregnant_second_trimester: 340, pregnant_third_trimester: 450, breastfeeding_0_6_months: 330, breastfeeding_7_12_months: 400 }
  const sexOffset = profile.sex === 'male' ? 5 : -161
  const bmr = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * profile.age + sexOffset)
  const reproductiveCalories = profile.sex === 'female' ? reproductiveCalorieAdjustments[profile.reproductiveStatus] : 0
  const baseTarget = Math.max(1200, Math.round((bmr * dailyActivityFactors[profile.dailyActivity] + goalAdjustments[profile.goal]) / 10) * 10 + reproductiveCalories)
  const rawBurn = intensityMet[profile.intensity] * profile.weight * (profile.workoutMinutes / 60)
  const workoutCaloriesPerSession = Math.round((rawBurn * .75) / 10) * 10
  const weeklyWorkoutCalories = workoutCaloriesPerSession * profile.workoutsPerWeek
  const averageWorkoutCalories = Math.round((weeklyWorkoutCalories / 7) / 10) * 10
  const dailyTarget = baseTarget + averageWorkoutCalories
  const protein = Math.round(profile.weight * (profile.goal === 'gain' ? 2 : profile.goal === 'lose' ? 1.8 : 1.6))
  const fat = Math.round(profile.weight * .8)
  const carbs = Math.max(0, Math.round((dailyTarget - protein * 4 - fat * 9) / 4))
  return { baseTarget, dailyTarget, workoutCaloriesPerSession, weeklyWorkoutCalories, averageWorkoutCalories, reproductiveCalories, protein, carbs, fat }
}

async function hashInput(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

type PlanCandidate = z.infer<typeof NutritionPlanOutput>
type MenuCandidate = z.infer<typeof MenuOption>

function totalMenu(menu: MenuCandidate): MenuCandidate {
  const meals = menu.meals.map(meal => ({
    ...meal,
    calories: meal.ingredients.reduce((sum, ingredient) => sum + ingredient.calories, 0),
  }))
  return {
    ...menu,
    meals,
    dailyCalories: meals.reduce((sum, meal) => sum + meal.calories, 0),
    protein: meals.reduce((sum, meal) => sum + meal.protein, 0),
    carbs: meals.reduce((sum, meal) => sum + meal.carbs, 0),
    fat: meals.reduce((sum, meal) => sum + meal.fat, 0),
  }
}

function totalPlan(plan: PlanCandidate): PlanCandidate {
  const ids = ['A', 'B', 'C'] as const
  const menus = plan.menus.map((menu, index) => totalMenu({ ...menu, id: ids[index], label: `Cardápio ${ids[index]}` }))
  const divisor = Math.max(1, menus.length)
  return {
    ...plan,
    menus,
    dailyCalories: Math.round(menus.reduce((sum, menu) => sum + menu.dailyCalories, 0) / divisor),
    protein: Math.round(menus.reduce((sum, menu) => sum + menu.protein, 0) / divisor),
    carbs: Math.round(menus.reduce((sum, menu) => sum + menu.carbs, 0) / divisor),
    fat: Math.round(menus.reduce((sum, menu) => sum + menu.fat, 0) / divisor),
  }
}

function fitMenuToBand(menu: MenuCandidate, target: number) {
  const current = totalMenu(menu)
  const minimum = Math.ceil(target * .95)
  if (current.dailyCalories >= minimum && current.dailyCalories <= target) return current

  const desired = Math.round(target * .975)
  const scalableUnits = new Set(['g', 'ml', 'colher de sopa', 'colher de chá', 'xícara'])
  const scalableCalories = current.meals.flatMap(meal => meal.ingredients).filter(item => scalableUnits.has(item.unit)).reduce((sum, item) => sum + item.calories, 0)
  const fixedCalories = current.dailyCalories - scalableCalories
  if (scalableCalories <= 0 || desired <= fixedCalories) return current
  const factor = (desired - fixedCalories) / scalableCalories
  if (factor < .5 || factor > 1.5) return current

  const meals = current.meals.map(meal => {
    const ingredients = meal.ingredients.map(ingredient => {
      if (!scalableUnits.has(ingredient.unit)) return ingredient
      const rawQuantity = ingredient.quantity * factor
      const quantity = ['g', 'ml'].includes(ingredient.unit) && rawQuantity >= 20 ? Math.max(5, Math.round(rawQuantity / 5) * 5) : Math.max(.25, Math.round(rawQuantity * 4) / 4)
      return { ...ingredient, quantity, calories: Math.max(0, Math.round(ingredient.calories * factor)) }
    })
    const calories = ingredients.reduce((sum, ingredient) => sum + ingredient.calories, 0)
    const macroFactor = meal.calories > 0 ? calories / meal.calories : 1
    return { ...meal, ingredients, calories, protein: Math.round(meal.protein * macroFactor), carbs: Math.round(meal.carbs * macroFactor), fat: Math.round(meal.fat * macroFactor) }
  })
  return totalMenu({ ...current, meals })
}

function fitCaloriesToBand(plan: PlanCandidate, target: number) {
  return totalPlan({ ...plan, menus: plan.menus.map(menu => fitMenuToBand(menu, target)) })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const auth = token ? await admin.auth.getUser(token) : null
  if (!auth?.data.user || auth.error) {
    return json({ error: 'UNAUTHORIZED', message: 'Entre na sua conta para gerar o plano alimentar.' }, 401)
  }
  const access = await accessForUser(admin, auth.data.user)
  if (access.billingEnabled && access.planMode !== 'guided') {
    return json({ error: 'SUBSCRIPTION_REQUIRED', message: 'O plano personalizado requer uma assinatura ativa.' }, 402)
  }

  const parsed = RequestInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ error: 'INVALID_PLAN_INPUT', message: 'Os dados do perfil ou do plano estão incompletos.' }, 400)
  }

  const { profile, preferences } = parsed.data
  const nutrition = nutritionFor(profile)
  const mealSchedule = schedule(preferences, profile)
  const inputHash = await hashInput({ profile, preferences, nutrition, promptVersion: PROMPT_VERSION })
  const cycleKey = accessCycleKey(access)
  const { data: existingReview, error: existingError } = await admin.from('diet_reviews')
    .select('id, status, draft_plan, approved_plan, source_model, updated_at')
    .eq('user_id', auth.data.user.id).eq('cycle_key', cycleKey).maybeSingle()
  if (existingError) return json({ error: 'REVIEW_LOOKUP_FAILED', message: 'Não foi possível consultar sua revisão agora.' }, 500)
  if (existingReview) {
    const currentPlan = existingReview.status === 'approved' ? existingReview.approved_plan : existingReview.draft_plan
    const hasThreeMenus = Array.isArray(currentPlan?.menus) && currentPlan.menus.length === 3
    if (existingReview.status === 'approved' || hasThreeMenus) {
      return json({
        plan: currentPlan,
        model: existingReview.source_model,
        generatedAt: existingReview.updated_at,
        cached: true,
        reviewId: existingReview.id,
        reviewStatus: existingReview.status,
      })
    }
    const { error: replaceError } = await admin.from('diet_reviews').delete().eq('id', existingReview.id).neq('status', 'approved')
    if (replaceError) return json({ error: 'LEGACY_PLAN_REPLACE_FAILED', message: 'Não foi possível atualizar o plano antigo para os cardápios A, B e C.' }, 500)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return json({ error: 'OPENAI_NOT_CONFIGURED', message: 'A geração do plano ainda não foi configurada.' }, 503)
  const model = Deno.env.get('OPENAI_PLAN_MODEL') || 'gpt-5.4-mini'
  const context = {
    objetivo: profile.goal,
    idade: profile.age,
    sexoBiologico: profile.sex,
    gestacaoOuAmamentacao: profile.reproductiveStatus,
    alturaCm: profile.height,
    pesoKg: profile.weight,
    atividadeCotidiana: profile.dailyActivity,
    treinosPorSemana: profile.workoutsPerWeek,
    duracaoTreinoMin: profile.workoutMinutes,
    metaCaloricaDiariaMedia: nutrition.dailyTarget,
    metaBaseSemExercicios: nutrition.baseTarget,
    gastoEstimadoPorTreino: nutrition.workoutCaloriesPerSession,
    gastoSemanalEstimadoComTreinos: nutrition.weeklyWorkoutCalories,
    mediaDiariaDosTreinos: nutrition.averageWorkoutCalories,
    acrescimoCaloricoGestacaoOuAmamentacao: nutrition.reproductiveCalories,
    horarioTreinoUsual: profile.workoutsPerWeek > 0 ? preferences.workoutTime || 'não informado' : 'não se aplica',
    macrosAlvo: { proteinaG: nutrition.protein, carboidratoG: nutrition.carbs, gorduraG: nutrition.fat },
    estiloAlimentar: preferences.dietaryStyle,
    restricoes: preferences.restrictions,
    alimentosPreferidos: preferences.favoriteFoods || 'não informado',
    alimentosEvitados: preferences.dislikedFoods || 'não informado',
    tempoParaCozinhar: preferences.cookingTime,
    orcamento: preferences.budget,
    disponibilidadeRefeicoesPrincipais: {
      cafeDaManha: preferences.breakfastAvailability,
      almoco: preferences.lunchAvailability,
      jantar: preferences.dinnerAvailability,
    },
    possuiCondicaoDeSaude: preferences.hasHealthCondition,
    condicoesSaudeEstruturadas: preferences.healthConditions,
    refeicoesObrigatorias: mealSchedule,
  }

  const systemPrompt = `Você cria TRÊS opções completas de cardápio diário brasileiro educativo, prático e nutricionalmente coeso: A, B e C.

REGRAS OBRIGATÓRIAS:
- Entregue exatamente 3 cardápios completos, identificados e ordenados como A, B e C.
- CADA cardápio deve conter exatamente as refeições e horários informados em refeicoesObrigatorias, na mesma ordem.
- A, B e C são alternativas para dias diferentes, não opções dentro da mesma refeição. Cada um deve funcionar sozinho como um dia completo.
- Garanta variedade real entre os cardápios: não repita títulos de refeições; varie as principais fontes de proteína, carboidrato, frutas e preparações. Não crie três versões quase iguais.
- Cada refeição deve ser um prato ou combinação que uma pessoa realmente comeria, com um título específico. Não entregue categorias vagas, listas de opções com "ou" nem alimentos desconectados.
- Informe a quantidade exata de CADA ingrediente. Para arroz, feijão, massas, carnes, tubérculos e legumes, use gramas do alimento pronto/cozido. Inclua também uma medida caseira clara.
- Aveia nunca é consumida pura: use-a em mingau, overnight oats, vitamina ou iogurte, com o líquido e acompanhamentos quantificados.
- Nunca coloque ovos e aveia na mesma refeição, nem como acompanhamentos. Se escolher ovos no café, combine com pão, tapioca, queijo ou fruta. Se escolher aveia, combine com leite, iogurte, bebida vegetal e fruta.
- Almoço e jantar devem ser preparações diferentes. Não repita no jantar a mesma combinação de carboidrato, leguminosa e proteína usada no almoço.
- Respeite integralmente estilo alimentar, restrições e alimentos evitados. Use preferidos quando forem compatíveis.
- Considere as condições de saúde estruturadas apenas como sinal de cautela educativa; não prescreva tratamento clínico nem invente restrições laboratoriais.
- Se gestacaoOuAmamentacao não for "none", respeite a fase informada e a meta já ajustada pelo acréscimo energético correspondente. Use escolhas conservadoras de segurança alimentar para gestação ou lactação e sinalize no resumo que a validação do obstetra e do nutricionista continua necessária.
- Em doença renal, não conclua que todo alimento rico em potássio está proibido nem que está liberado: use uma seleção conservadora, não destaque alegações clínicas e deixe a decisão final para o nutricionista, que receberá as observações do usuário.
- Priorize alimentos comuns no Brasil e respeite o orçamento e o tempo de preparo.
- Use horarioTreinoUsual e workoutRelation de refeicoesObrigatorias para organizar o entorno do treino. Na refeição pre_workout, priorize uma fonte de carboidrato de digestão adequada ao intervalo até o treino, com proteína moderada e sem excesso de gordura ou volume. Na refeição post_workout, garanta uma fonte proteica relevante para recuperação e mantenha carboidratos em quantidade compatível com o treino e com a meta diária; não imponha uma redução rígida de carboidratos no pós-treino, pois a reposição de glicogênio também pode ser necessária.
- Respeite availability em cada item de refeicoesObrigatorias: comfortable permite uma refeição completa; limited exige prato simples, fácil de deixar pronto e consumir em 15 a 30 minutos; very_limited exige opção portátil, marmita pronta, montagem mínima ou consumo em até 15 minutos. Não sugira preparo elaborado durante esse intervalo.
- Quando o almoço for limited ou very_limited, mantenha nele uma fonte proteica e uma refeição viável, mas transfira para o jantar ou para uma refeição posterior a parcela de calorias e macros que tornaria o almoço impraticável. Preserve o total diário e evite transformar o almoço em um lanche nutricionalmente insuficiente.
- O horário do treino orienta apenas a distribuição das refeições e macros. Ele nunca altera a meta calórica diária média, que já considera a média semanal dos treinos.
- Em CADA cardápio, a soma real das calorias dos ingredientes deve ficar entre 95% e 100% da meta calórica diária média. Essa meta já distribui o gasto dos treinos semanais igualmente pelos sete dias e não muda entre dias com e sem treino. Pode ficar até 5% abaixo, mas nunca acima da meta. Aproxime proteína, carboidratos e gorduras dos alvos em cada opção.
- Calorias dos ingredientes devem somar aproximadamente as calorias da refeição. Os totais diários devem refletir a soma das refeições.
- Não gere modo de preparo. O preparo será criado somente depois que um nutricionista confirmar os ingredientes e as quantidades.
- Não prescreva tratamento para doenças e não faça promessas clínicas. Se possuiCondicaoDeSaude for verdadeiro, mantenha a sugestão conservadora e inclua orientação para validação profissional obrigatória.
- Escreva em português do Brasil, de forma direta e sem texto promocional.`

  try {
    const openai = new OpenAI({ apiKey })
    const generateCandidate = async (revision?: string) => {
      const input = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: JSON.stringify(context) },
      ]
      if (revision) input.push({ role: 'user', content: revision })
      const result = await openai.responses.parse({
        model,
        input,
        max_output_tokens: 12000,
        text: { format: zodTextFormat(NutritionPlanOutput, 'nutrition_plan') },
      })
      if (!result.output_parsed || result.output_parsed.menus.length !== 3 || result.output_parsed.menus.some(menu => menu.meals.length !== mealSchedule.length)) return null
      const ids = ['A', 'B', 'C'] as const
      const menus = result.output_parsed.menus.map((menu, menuIndex) => ({
        ...menu,
        id: ids[menuIndex],
        label: `Cardápio ${ids[menuIndex]}`,
        meals: menu.meals.map((meal, mealIndex) => ({
          ...meal,
          label: mealSchedule[mealIndex].label,
          time: mealSchedule[mealIndex].time,
          calories: meal.ingredients.reduce((sum, ingredient) => sum + ingredient.calories, 0),
        })),
      }))
      return totalPlan({ ...result.output_parsed, menus })
    }

    const assess = (candidate: NonNullable<Awaited<ReturnType<typeof generateCandidate>>>) => {
      const allMeals = candidate.menus.flatMap(menu => menu.meals)
      const eggAndOats = allMeals.some(meal => {
        const foods = meal.ingredients.map(ingredient => ingredient.name.toLocaleLowerCase('pt-BR')).join(' ')
        return foods.includes('aveia') && /\bovo(?:s)?\b/.test(foods)
      })
      const minimum = Math.ceil(nutrition.dailyTarget * .95)
      const distances = candidate.menus.map(menu => menu.dailyCalories > nutrition.dailyTarget ? menu.dailyCalories - nutrition.dailyTarget : menu.dailyCalories < minimum ? minimum - menu.dailyCalories : 0)
      const normalizedTitles = allMeals.map(meal => meal.title.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9áàâãéêíóôõúç ]/gi, '').trim())
      const duplicateTitles = new Set(normalizedTitles).size !== normalizedTitles.length
      const preIndex = mealSchedule.findIndex(meal => meal.workoutRelation === 'pre_workout')
      const postIndex = mealSchedule.findIndex(meal => meal.workoutRelation === 'post_workout')
      const minimumPostProtein = Math.min(20, Math.max(12, Math.round(nutrition.protein * .12)))
      const workoutTimingMismatch = candidate.menus.some(menu => {
        const preWorkout = preIndex >= 0 ? menu.meals[preIndex] : null
        const postWorkout = postIndex >= 0 ? menu.meals[postIndex] : null
        return Boolean((preWorkout && preWorkout.carbs < preWorkout.protein) || (postWorkout && postWorkout.protein < minimumPostProtein))
      })
      const distanceFromBand = distances.reduce((sum, distance) => sum + distance, 0)
      return { eggAndOats, duplicateTitles, workoutTimingMismatch, distanceFromBand, insideBand: distances.every(distance => distance === 0) }
    }

    const first = await generateCandidate()
    const firstQuality = first ? assess(first) : null
    let plan = first
    if (!first || firstQuality?.eggAndOats || firstQuality?.duplicateTitles || firstQuality?.workoutTimingMismatch || !firstQuality?.insideBand) {
      const minimum = Math.ceil(nutrition.dailyTarget * .95)
      const details = !first ? 'A resposta não veio com os três cardápios e todas as refeições.' : `Totais por cardápio: ${first.menus.map(menu => `${menu.id}=${menu.dailyCalories} kcal`).join(', ')}${firstQuality?.eggAndOats ? '; houve combinação de ovo com aveia' : ''}${firstQuality?.duplicateTitles ? '; houve títulos repetidos entre opções' : ''}${firstQuality?.workoutTimingMismatch ? '; a distribuição pré/pós-treino não seguiu o contexto informado' : ''}.`
      const second = await generateCandidate(`Revise completamente os três cardápios. ${details} Em CADA cardápio, a soma dos ingredientes precisa ficar obrigatoriamente entre ${minimum} e ${nutrition.dailyTarget} kcal, sem ultrapassar o limite superior. Garanta variedade real entre A, B e C e cumpra todas as regras de coerência. Não explique a revisão; devolva somente o plano estruturado.`)
      const candidates = [first, second].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      const coherent = candidates.filter(candidate => !assess(candidate).eggAndOats && !assess(candidate).duplicateTitles)
      plan = (coherent.length ? coherent : candidates).sort((a, b) => assess(a).distanceFromBand - assess(b).distanceFromBand)[0] || null
    }
    if (!plan || assess(plan).eggAndOats || assess(plan).duplicateTitles) {
      return json({ error: 'PLAN_QUALITY_FAILED', message: 'A IA não conseguiu produzir uma combinação alimentar coerente. Tente novamente.' }, 422)
    }
    plan = fitCaloriesToBand(plan, nutrition.dailyTarget)
    const minimumCalories = Math.ceil(nutrition.dailyTarget * .95)
    if (plan.menus.some(menu => menu.dailyCalories < minimumCalories || menu.dailyCalories > nutrition.dailyTarget)) {
      return json({ error: 'PLAN_CALORIE_RANGE_FAILED', message: 'Não foi possível ajustar as porções dentro da faixa calórica. Gere outra versão.' }, 422)
    }
    const generatedAt = new Date().toISOString()
    const { data: storedPreferences } = await admin.from('plan_preferences').select('health_notes').eq('user_id', auth.data.user.id).maybeSingle()
    const contextSnapshot = {
      profile: {
        age: profile.age, sex: profile.sex, reproductiveStatus: profile.reproductiveStatus, height: profile.height, weight: profile.weight,
        goal: profile.goal, dailyActivity: profile.dailyActivity, workoutsPerWeek: profile.workoutsPerWeek,
        workoutMinutes: profile.workoutMinutes, intensity: profile.intensity,
      },
      nutrition,
      preferences: {
        ...preferences,
        healthNotes: redactNotes(String(storedPreferences?.health_notes || ''), profile.name, auth.data.user.email),
      },
    }
    const { data: review, error: saveError } = await admin.from('diet_reviews').insert({
      user_id: auth.data.user.id,
      cycle_key: cycleKey,
      status: 'pending',
      context_snapshot: contextSnapshot,
      draft_plan: plan,
      input_hash: inputHash,
      source_model: model,
      submitted_at: generatedAt,
    }).select('id').single()
    if (saveError?.code === '23505') {
      const { data: current } = await admin.from('diet_reviews')
        .select('id, status, draft_plan, approved_plan, source_model, updated_at')
        .eq('user_id', auth.data.user.id).eq('cycle_key', cycleKey).single()
      if (current) return json({
        plan: current.status === 'approved' ? current.approved_plan : current.draft_plan,
        model: current.source_model, generatedAt: current.updated_at, cached: true,
        reviewId: current.id, reviewStatus: current.status,
      })
    }
    if (saveError) throw saveError
    return json({ plan, model, generatedAt, cached: false, reviewId: review.id, reviewStatus: 'pending' })
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500
    return json({
      error: 'PLAN_GENERATION_FAILED',
      message: status === 429 ? 'O limite temporário da IA foi atingido. Tente novamente em alguns instantes.' : 'Não foi possível gerar o plano alimentar agora.',
    }, status >= 400 && status < 600 ? status : 500)
  }
})
