export type Goal = 'lose' | 'maintain' | 'gain'
export type BiologicalSex = 'female' | 'male'
export type ReproductiveStatus = 'none' | 'pregnant_first_trimester' | 'pregnant_second_trimester' | 'pregnant_third_trimester' | 'breastfeeding_0_6_months' | 'breastfeeding_7_12_months'
export type Intensity = 'light' | 'moderate' | 'intense'
export type DailyActivity = 'sedentary' | 'light' | 'active' | 'heavy'
export type DietaryStyle = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian'
export type CookingTime = 'quick' | 'moderate' | 'flexible'
export type FoodBudget = 'economy' | 'balanced' | 'flexible'
export type MealAvailability = 'comfortable' | 'limited' | 'very_limited'
export type HealthCondition = 'diabetes' | 'hypertension' | 'kidney_disease' | 'liver_disease' | 'heart_disease' | 'other'
export type AppTheme = 'nature' | 'ocean' | 'terracotta' | 'lavender' | 'dark' | 'lilac-night'
export type PlanMode = 'self' | 'guided'
export type SubscriptionStatus = 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused'

export interface Profile {
  name: string
  age: number
  height: number
  weight: number
  sex: BiologicalSex
  reproductiveStatus: ReproductiveStatus
  goal: Goal
  dailyActivity: DailyActivity
  workoutsPerWeek: number
  workoutMinutes: number
  intensity: Intensity
  theme: AppTheme
}

export interface FoodBreakdown {
  name: string
  quantity: number
  unit: string
  calories: number
  protein?: number
  carbs?: number
  fat?: number
}

export interface DetectedMealItem {
  name: string
  quantity: number
  unit: string
  confidence: 'low' | 'medium' | 'high'
}

export interface MealImageAnalysis {
  items: DetectedMealItem[]
  confidence: 'low' | 'medium' | 'high'
  note: string
  question: string
  model: string
}

export interface MealEntry {
  id: string
  time: string
  description: string
  calories: number
  mealType: string
  breakdown: FoodBreakdown[]
}

export interface DayLog {
  date: string
  workoutDone: boolean
  entries: MealEntry[]
}

export interface NutritionPlan {
  bmr: number
  baseTarget: number
  dailyTarget: number
  workoutCaloriesPerSession: number
  weeklyWorkoutCalories: number
  averageWorkoutCalories: number
  reproductiveCalories: number
  protein: number
  carbs: number
  fat: number
  water: number
}

export interface PlanPreferences {
  planMode: PlanMode
  dietaryStyle: DietaryStyle
  mealsPerDay: 3 | 4 | 5 | 6
  restrictions: string[]
  favoriteFoods: string
  dislikedFoods: string
  cookingTime: CookingTime
  budget: FoodBudget
  breakfastTime: string
  lunchTime: string
  dinnerTime: string
  workoutTime: string
  breakfastAvailability: MealAvailability
  lunchAvailability: MealAvailability
  dinnerAvailability: MealAvailability
  hasHealthCondition: boolean
  healthConditions: HealthCondition[]
  healthNotes: string
  completedAt: string
}

export interface Subscription {
  planMode: PlanMode
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface SelfPlanItem {
  id: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface SelfPlanMeal {
  id: string
  label: string
  time: string
  items: SelfPlanItem[]
}

export interface SelfPlannerPlan {
  meals: SelfPlanMeal[]
  updatedAt: string
}

export interface PlanIngredient {
  name: string
  quantity: number
  unit: string
  householdMeasure: string
  calories: number
}

export interface GeneratedMeal {
  label: string
  time: string
  title: string
  ingredients: PlanIngredient[]
  preparation?: string
  calories: number
  protein: number
  carbs: number
  fat: number
  swapSuggestions?: MealSwapSuggestion[]
}

export interface MealSwapSuggestion {
  title: string
  ingredients: PlanIngredient[]
  preparation: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type GeneratedMenuId = 'A' | 'B' | 'C'

export interface GeneratedMenuOption {
  id: GeneratedMenuId
  label: string
  dailyCalories: number
  protein: number
  carbs: number
  fat: number
  meals: GeneratedMeal[]
}

export interface GeneratedNutritionPlan {
  summary: string
  dailyCalories: number
  protein: number
  carbs: number
  fat: number
  menus: GeneratedMenuOption[]
  meals?: GeneratedMeal[]
  dailyGuidance: string[]
  isCustomized?: boolean
}

export interface GeneratedPlanResponse {
  plan: GeneratedNutritionPlan
  model: string
  generatedAt: string
  cached: boolean
  reviewId?: string
  reviewStatus?: 'pending' | 'in_review' | 'approved'
}
