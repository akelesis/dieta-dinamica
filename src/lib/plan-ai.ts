import type { GeneratedPlanResponse, NutritionPlan, PlanPreferences, Profile } from '../types'
import { normalizeGeneratedPlan } from './generated-plan'
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

  const response = data as GeneratedPlanResponse
  return { ...response, plan: normalizeGeneratedPlan(response.plan) }
}
