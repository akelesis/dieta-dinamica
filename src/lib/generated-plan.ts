import type { GeneratedMeal, GeneratedMenuId, GeneratedMenuOption, GeneratedNutritionPlan } from '../types'

const MENU_IDS: GeneratedMenuId[] = ['A', 'B', 'C']

function totals(meals: GeneratedMeal[]) {
  const normalizedMeals = meals.map(meal => ({
    ...meal,
    calories: meal.ingredients.reduce((sum, item) => sum + Number(item.calories || 0), 0),
  }))
  return {
    meals: normalizedMeals,
    dailyCalories: normalizedMeals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0),
    protein: normalizedMeals.reduce((sum, meal) => sum + Number(meal.protein || 0), 0),
    carbs: normalizedMeals.reduce((sum, meal) => sum + Number(meal.carbs || 0), 0),
    fat: normalizedMeals.reduce((sum, meal) => sum + Number(meal.fat || 0), 0),
  }
}

export function normalizeGeneratedPlan(plan: GeneratedNutritionPlan): GeneratedNutritionPlan {
  const sourceMenus = plan.menus?.length
    ? plan.menus
    : [{ id: 'A' as const, label: 'Cardápio A', meals: plan.meals || [], dailyCalories: plan.dailyCalories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat }]
  const menus: GeneratedMenuOption[] = sourceMenus.slice(0, 3).map((menu, index) => ({
    ...menu,
    id: MENU_IDS[index],
    label: `Cardápio ${MENU_IDS[index]}`,
    ...totals(menu.meals),
  }))
  const divisor = Math.max(1, menus.length)
  return {
    ...plan,
    menus,
    meals: undefined,
    dailyCalories: Math.round(menus.reduce((sum, menu) => sum + menu.dailyCalories, 0) / divisor),
    protein: Math.round(menus.reduce((sum, menu) => sum + menu.protein, 0) / divisor),
    carbs: Math.round(menus.reduce((sum, menu) => sum + menu.carbs, 0) / divisor),
    fat: Math.round(menus.reduce((sum, menu) => sum + menu.fat, 0) / divisor),
  }
}
