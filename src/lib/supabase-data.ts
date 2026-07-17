import type { DayLog, MealEntry, PlanMode, PlanPreferences, Profile, Subscription } from '../types'
import { supabase } from './supabase'

export interface UserState {
  profile: Profile | null
  planPreferences: PlanPreferences | null
  subscription: Subscription | null
  betaPlan: PlanMode | null
  billingEnabled: boolean
  log: DayLog
}

function client() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function profileFromRow(row: Record<string, unknown>): Profile {
  return {
    name: String(row.name),
    age: Number(row.age),
    height: Number(row.height),
    weight: Number(row.weight),
    sex: row.sex as Profile['sex'],
    goal: row.goal as Profile['goal'],
    dailyActivity: (row.daily_activity || 'light') as Profile['dailyActivity'],
    workoutsPerWeek: Number(row.workouts_per_week),
    workoutMinutes: Number(row.workout_minutes),
    intensity: row.intensity as Profile['intensity'],
    theme: (row.theme || 'nature') as Profile['theme'],
  }
}

function planFromRow(row: Record<string, unknown>): PlanPreferences {
  return {
    planMode: (row.plan_mode || 'guided') as PlanPreferences['planMode'],
    dietaryStyle: row.dietary_style as PlanPreferences['dietaryStyle'],
    mealsPerDay: Number(row.meals_per_day) as PlanPreferences['mealsPerDay'],
    restrictions: Array.isArray(row.restrictions) ? row.restrictions.map(String) : [],
    favoriteFoods: String(row.favorite_foods || ''),
    dislikedFoods: String(row.disliked_foods || ''),
    cookingTime: row.cooking_time as PlanPreferences['cookingTime'],
    budget: row.budget as PlanPreferences['budget'],
    breakfastTime: String(row.breakfast_time).slice(0, 5),
    lunchTime: String(row.lunch_time).slice(0, 5),
    dinnerTime: String(row.dinner_time).slice(0, 5),
    hasHealthCondition: Boolean(row.has_health_condition),
    healthConditions: Array.isArray(row.health_conditions) ? row.health_conditions as PlanPreferences['healthConditions'] : [],
    healthNotes: String(row.health_notes || ''),
    completedAt: String(row.completed_at),
  }
}

function mealFromRow(row: Record<string, unknown>): MealEntry {
  return {
    id: String(row.id),
    time: String(row.meal_time).slice(0, 5),
    description: String(row.description),
    calories: Number(row.calories),
    mealType: String(row.meal_type),
    breakdown: Array.isArray(row.breakdown) ? row.breakdown as MealEntry['breakdown'] : [],
  }
}

export async function loadUserState(userId: string, date: string): Promise<UserState> {
  const db = client()
  const [profileResult, planResult, subscriptionResult, betaResult, billingResult, dayResult] = await Promise.all([
    db.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    db.from('plan_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('subscriptions').select('plan_mode, status, current_period_end, cancel_at_period_end').eq('user_id', userId).maybeSingle(),
    db.rpc('beta_plan_for_current_user'),
    db.rpc('is_billing_enabled'),
    db.from('day_logs').select('id, log_date, workout_done, meal_entries(*)').eq('user_id', userId).eq('log_date', date).maybeSingle(),
  ])

  const error = profileResult.error || planResult.error || subscriptionResult.error || betaResult.error || billingResult.error || dayResult.error
  if (error) throw error

  const day = dayResult.data as (Record<string, unknown> & { meal_entries?: Record<string, unknown>[] }) | null
  return {
    profile: profileResult.data ? profileFromRow(profileResult.data) : null,
    planPreferences: planResult.data ? planFromRow(planResult.data) : null,
    subscription: subscriptionResult.data ? {
      planMode: subscriptionResult.data.plan_mode as Subscription['planMode'],
      status: subscriptionResult.data.status as Subscription['status'],
      currentPeriodEnd: subscriptionResult.data.current_period_end,
      cancelAtPeriodEnd: Boolean(subscriptionResult.data.cancel_at_period_end),
    } : null,
    betaPlan: betaResult.data as PlanMode | null,
    billingEnabled: Boolean(billingResult.data),
    log: {
      date,
      workoutDone: Boolean(day?.workout_done),
      entries: (day?.meal_entries || []).map(mealFromRow).sort((a, b) => a.time.localeCompare(b.time)),
    },
  }
}

export async function upsertProfile(userId: string, profile: Profile) {
  const { error } = await client().from('profiles').upsert({
    user_id: userId,
    name: profile.name,
    age: profile.age,
    height: profile.height,
    weight: profile.weight,
    sex: profile.sex,
    goal: profile.goal,
    daily_activity: profile.dailyActivity,
    workouts_per_week: profile.workoutsPerWeek,
    workout_minutes: profile.workoutMinutes,
    intensity: profile.intensity,
    theme: profile.theme,
  })
  if (error) throw error
}

export async function upsertPlanPreferences(userId: string, plan: PlanPreferences) {
  const { error } = await client().from('plan_preferences').upsert({
    user_id: userId,
    plan_mode: plan.planMode,
    dietary_style: plan.dietaryStyle,
    meals_per_day: plan.mealsPerDay,
    restrictions: plan.restrictions,
    favorite_foods: plan.favoriteFoods,
    disliked_foods: plan.dislikedFoods,
    cooking_time: plan.cookingTime,
    budget: plan.budget,
    breakfast_time: plan.breakfastTime,
    lunch_time: plan.lunchTime,
    dinner_time: plan.dinnerTime,
    has_health_condition: plan.hasHealthCondition,
    health_conditions: plan.healthConditions,
    health_notes: plan.healthNotes,
    completed_at: plan.completedAt,
  })
  if (error) throw error
}

export async function replaceDayLog(userId: string, log: DayLog) {
  void userId
  const { error } = await client().rpc('replace_day_log', {
    p_log_date: log.date,
    p_workout_done: log.workoutDone,
    p_entries: log.entries,
  })
  if (error) throw error
}

export async function deletePlanPreferences(userId: string) {
  const db = client()
  const { error: generatedError } = await db.from('generated_plans').delete().eq('user_id', userId)
  if (generatedError) throw generatedError
  const { error: selfPlanError } = await db.from('self_plans').delete().eq('user_id', userId)
  if (selfPlanError) throw selfPlanError
  const { error } = await db.from('plan_preferences').delete().eq('user_id', userId)
  if (error) throw error
}

export async function deleteUserData(userId: string) {
  const db = client()
  const { error: generatedError } = await db.from('generated_plans').delete().eq('user_id', userId)
  if (generatedError) throw generatedError
  const { error: selfPlanError } = await db.from('self_plans').delete().eq('user_id', userId)
  if (selfPlanError) throw selfPlanError
  const { error: daysError } = await db.from('day_logs').delete().eq('user_id', userId)
  if (daysError) throw daysError
  const { error: planError } = await db.from('plan_preferences').delete().eq('user_id', userId)
  if (planError) throw planError
  const { error: profileError } = await db.from('profiles').delete().eq('user_id', userId)
  if (profileError) throw profileError
}
