import type { GeneratedMeal, GeneratedNutritionPlan, GeneratedPlanResponse, MealSwapSuggestion, NutritionPlan, PlanPreferences, Profile } from '../types'
import { supabase } from './supabase'

export class PlanGenerationError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export async function generateNutritionPlan(
  profile: Profile,
  nutrition: NutritionPlan,
  preferences: PlanPreferences,
  force = false,
): Promise<GeneratedPlanResponse> {
  if (!supabase) {
    throw new PlanGenerationError('SUPABASE_NOT_CONFIGURED', 'A geração por IA requer a conexão com o Supabase.')
  }

  const safePreferences = { ...preferences, healthNotes: '' }
  const { data, error } = await supabase.functions.invoke('generate-plan', {
    body: { profile, nutrition, preferences: safePreferences, force },
  })

  if (error) {
    let message = error.message || 'Não foi possível gerar seu plano agora.'
    const response = (error as { context?: Response }).context
    if (response) {
      const body = await response.clone().json().catch(() => null) as { message?: string } | null
      if (body?.message) message = body.message
    }
    throw new PlanGenerationError('PLAN_GENERATION_FAILED', message)
  }

  return data as GeneratedPlanResponse
}

export async function saveCustomizedNutritionPlan(plan: GeneratedNutritionPlan) {
  if (!supabase) throw new PlanGenerationError('SUPABASE_NOT_CONFIGURED', 'O Supabase não está configurado.')
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new PlanGenerationError('UNAUTHORIZED', 'Entre na sua conta para salvar o plano.')
  const { error } = await supabase.from('generated_plans').update({
    plan_json: { ...plan, isCustomized: true },
    updated_at: new Date().toISOString(),
  }).eq('user_id', auth.user.id)
  if (error) throw new PlanGenerationError('SAVE_FAILED', 'Não foi possível salvar a personalização.')
}

export async function suggestMealSwaps(meal: GeneratedMeal, profile: Profile, preferences: PlanPreferences): Promise<MealSwapSuggestion[]> {
  if (!supabase) throw new PlanGenerationError('SUPABASE_NOT_CONFIGURED', 'A geração de trocas requer o Supabase.')
  const { data, error } = await supabase.functions.invoke('meal-swaps', {
    body: { meal, profile, preferences: { ...preferences, healthNotes: '' } },
  })
  if (error) {
    let message = error.message || 'Não foi possível sugerir trocas agora.'
    const response = (error as { context?: Response }).context
    if (response) {
      const body = await response.clone().json().catch(() => null) as { message?: string } | null
      if (body?.message) message = body.message
    }
    throw new PlanGenerationError('SWAPS_FAILED', message)
  }
  return (data as { suggestions: MealSwapSuggestion[] }).suggestions
}
