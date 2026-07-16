import type { FoodBreakdown } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'

export interface AiFoodEstimate {
  items: FoodBreakdown[]
  totalCalories: number
  confidence: 'low' | 'medium' | 'high'
  note: string
  model: string
  cached: boolean
  cache: {
    hit: boolean
    hitCount: number
    strategy: 'portions' | 'description' | 'items' | 'taco'
  }
}

export class FoodEstimateError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export async function estimateFoodWithOpenAI(description: string): Promise<AiFoodEstimate> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.functions.invoke('food-estimate', { body: { description } })
    if (error) {
      throw new FoodEstimateError('REQUEST_FAILED', error.message || 'Não foi possível analisar a refeição.')
    }
    return data as AiFoodEstimate
  }

  const response = await fetch('/api/food/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new FoodEstimateError(body.error || 'REQUEST_FAILED', body.message || 'Não foi possível analisar a refeição.')
  }
  return body as AiFoodEstimate
}
