import type { GeneratedNutritionPlan } from '../types'
import { normalizeGeneratedPlan } from './generated-plan'
import { supabase } from './supabase'

export interface NutritionistReviewContext {
  profile: { age: number; sex: 'female' | 'male'; height: number; weight: number; goal: string; dailyActivity: string; workoutsPerWeek: number; workoutMinutes: number; intensity: string }
  nutrition: { dailyTarget?: number; baseTarget?: number; workoutCaloriesPerSession?: number; weeklyWorkoutCalories?: number; averageWorkoutCalories?: number; restTarget?: number; activeTarget?: number; protein: number; carbs: number; fat: number }
  preferences: { dietaryStyle: string; mealsPerDay: number; restrictions: string[]; favoriteFoods: string; dislikedFoods: string; cookingTime: string; budget: string; hasHealthCondition: boolean; healthConditions: string[]; healthNotes?: string }
}

export interface NutritionistReview {
  id: string
  caseCode: string
  status: 'pending' | 'in_review' | 'approved'
  context: NutritionistReviewContext
  plan: GeneratedNutritionPlan
  submittedAt: string
  updatedAt: string
  reviewedAt?: string | null
}

async function invoke<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.functions.invoke('nutritionist-reviews', { body })
  if (error) {
    const response = (error as { context?: Response }).context
    const payload = response ? await response.clone().json().catch(() => null) as { message?: string } | null : null
    throw new Error(payload?.message || error.message || 'Não foi possível acessar a fila de revisão.')
  }
  return data as T
}

export async function listNutritionistReviews() {
  return (await invoke<{ reviews: NutritionistReview[] }>({ action: 'list' })).reviews.map(review => ({ ...review, plan: normalizeGeneratedPlan(review.plan) }))
}

export async function getNutritionistReview(reviewId: string) {
  const review = (await invoke<{ review: NutritionistReview }>({ action: 'get', reviewId })).review
  return { ...review, plan: normalizeGeneratedPlan(review.plan) }
}

export async function saveNutritionistReview(reviewId: string, plan: GeneratedNutritionPlan) {
  const review = (await invoke<{ review: NutritionistReview }>({ action: 'save', reviewId, plan })).review
  return { ...review, plan: normalizeGeneratedPlan(review.plan) }
}

export async function approveNutritionistReview(reviewId: string, plan: GeneratedNutritionPlan) {
  const review = (await invoke<{ review: NutritionistReview }>({ action: 'approve', reviewId, plan })).review
  return { ...review, plan: normalizeGeneratedPlan(review.plan) }
}
