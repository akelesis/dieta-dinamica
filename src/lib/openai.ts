import type { FoodBreakdown, MealImageAnalysis } from '../types'
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

export async function transcribeMealAudio(audio: Blob): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new FoodEstimateError('SUPABASE_NOT_CONFIGURED', 'O ditado requer conexão com o Supabase.')
  }
  const extension = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'mp4' : 'webm'
  const form = new FormData()
  form.append('audio', audio, `refeicao.${extension}`)
  const { data, error } = await supabase.functions.invoke('transcribe-meal', { body: form })
  if (error) {
    let message = error.message || 'Não foi possível transcrever a gravação.'
    const response = (error as { context?: Response }).context
    if (response) {
      const body = await response.clone().json().catch(() => null) as { message?: string } | null
      if (body?.message) message = body.message
    }
    throw new FoodEstimateError('TRANSCRIPTION_FAILED', message)
  }
  const text = typeof data?.text === 'string' ? data.text.trim() : ''
  if (!text) throw new FoodEstimateError('EMPTY_TRANSCRIPTION', 'Não conseguimos identificar fala nessa gravação.')
  return text
}

export async function analyzeMealImage(image: Blob): Promise<MealImageAnalysis> {
  if (!isSupabaseConfigured || !supabase) {
    throw new FoodEstimateError('SUPABASE_NOT_CONFIGURED', 'A análise de fotos requer conexão com o Supabase.')
  }
  const form = new FormData()
  form.append('image', image, 'refeicao.jpg')
  const { data, error } = await supabase.functions.invoke('analyze-meal-image', { body: form })
  if (error) {
    let message = error.message || 'Não foi possível analisar a foto da refeição.'
    const response = (error as { context?: Response }).context
    if (response) {
      const body = await response.clone().json().catch(() => null) as { message?: string } | null
      if (body?.message) message = body.message
    }
    throw new FoodEstimateError('IMAGE_ANALYSIS_FAILED', message)
  }
  return data as MealImageAnalysis
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
