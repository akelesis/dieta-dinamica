export type Goal = 'lose' | 'maintain' | 'gain'
export type BiologicalSex = 'female' | 'male'
export type Intensity = 'light' | 'moderate' | 'intense'
export type DailyActivity = 'sedentary' | 'light' | 'active' | 'heavy'
export type DietaryStyle = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian'
export type CookingTime = 'quick' | 'moderate' | 'flexible'
export type FoodBudget = 'economy' | 'balanced' | 'flexible'
export type HealthCondition = 'diabetes' | 'hypertension' | 'kidney_disease' | 'liver_disease' | 'heart_disease' | 'other'
export type AppTheme = 'nature' | 'ocean' | 'terracotta' | 'dark'

export interface Profile {
  name: string
  age: number
  height: number
  weight: number
  sex: BiologicalSex
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
  restTarget: number
  activeTarget: number
  workoutBonus: number
  protein: number
  carbs: number
  fat: number
  water: number
}

export interface PlanPreferences {
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
  hasHealthCondition: boolean
  healthConditions: HealthCondition[]
  healthNotes: string
  completedAt: string
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
  preparation: string
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

export interface GeneratedNutritionPlan {
  summary: string
  dailyCalories: number
  protein: number
  carbs: number
  fat: number
  meals: GeneratedMeal[]
  dailyGuidance: string[]
  isCustomized?: boolean
}

export interface GeneratedPlanResponse {
  plan: GeneratedNutritionPlan
  model: string
  generatedAt: string
  cached: boolean
}
