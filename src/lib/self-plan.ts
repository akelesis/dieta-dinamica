import { supabase } from './supabase'
import type { PlanPreferences, SelfPlanMeal, SelfPlannerPlan } from '../types'

const SELF_PLAN_KEY = 'vivameta:self-planner'

const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function createSelfPlannerPlan(preferences: PlanPreferences): SelfPlannerPlan {
  const all: Omit<SelfPlanMeal, 'id' | 'items'>[] = [
    { label: 'Café da manhã', time: preferences.breakfastTime },
    { label: 'Lanche da manhã', time: '10:30' },
    { label: 'Almoço', time: preferences.lunchTime },
    { label: 'Lanche da tarde', time: '16:30' },
    { label: 'Jantar', time: preferences.dinnerTime },
    { label: 'Ceia', time: '21:30' },
  ]
  const excluded = preferences.mealsPerDay === 3
    ? ['Lanche da manhã', 'Lanche da tarde', 'Ceia']
    : preferences.mealsPerDay === 4
      ? ['Lanche da manhã', 'Ceia']
      : preferences.mealsPerDay === 5 ? ['Ceia'] : []

  return {
    meals: all.filter(meal => !excluded.includes(meal.label)).map(meal => ({ ...meal, id: id(), items: [] })),
    updatedAt: new Date().toISOString(),
  }
}

export async function loadSelfPlannerPlan(): Promise<SelfPlannerPlan | null> {
  if (!supabase) {
    try {
      const stored = localStorage.getItem(SELF_PLAN_KEY)
      return stored ? JSON.parse(stored) as SelfPlannerPlan : null
    } catch { return null }
  }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Entre na sua conta para carregar o planejador.')
  const { data, error } = await supabase.from('self_plans').select('plan_json').eq('user_id', auth.user.id).maybeSingle()
  if (error) throw error
  return data?.plan_json as SelfPlannerPlan | null
}

export async function saveSelfPlannerPlan(plan: SelfPlannerPlan): Promise<void> {
  if (!supabase) {
    localStorage.setItem(SELF_PLAN_KEY, JSON.stringify(plan))
    return
  }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Entre na sua conta para salvar o planejador.')
  const { error } = await supabase.from('self_plans').upsert({ user_id: auth.user.id, plan_json: plan })
  if (error) throw error
}
