import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { accessForUser } from '../_shared/access.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const MealImageAnalysis = z.object({
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    confidence: z.enum(['low', 'medium', 'high']),
  })).min(1).max(12),
  confidence: z.enum(['low', 'medium', 'high']),
  note: z.string(),
  question: z.string(),
})

function secretKey() {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined } catch { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const auth = token ? await admin.auth.getUser(token) : null
  if (!auth?.data.user || auth.error) return json({ error: 'UNAUTHORIZED', message: 'Entre na sua conta para analisar uma foto.' }, 401)
  const access = await accessForUser(admin, auth.data.user)
  if (access.billingEnabled && !access.planMode) {
    return json({ error: 'SUBSCRIPTION_REQUIRED', message: 'A análise de fotos requer uma assinatura ativa.' }, 402)
  }

  const form = await request.formData().catch(() => null)
  const image = form?.get('image')
  if (!(image instanceof File)) return json({ error: 'IMAGE_REQUIRED', message: 'Selecione uma foto da refeição.' }, 400)
  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) return json({ error: 'INVALID_IMAGE_TYPE', message: 'Use uma imagem JPG, PNG ou WEBP.' }, 415)
  if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) return json({ error: 'INVALID_IMAGE_SIZE', message: 'A foto deve ter no máximo 4 MB.' }, 413)

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return json({ error: 'OPENAI_NOT_CONFIGURED', message: 'OPENAI_API_KEY não configurada na Edge Function.' }, 503)
  const model = Deno.env.get('OPENAI_VISION_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-5.6'

  try {
    const imageBytes = new Uint8Array(await image.arrayBuffer())
    const imageUrl = `data:${image.type};base64,${bytesToBase64(imageBytes)}`
    const result = await new OpenAI({ apiKey }).responses.parse({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'Você identifica alimentos em fotos de refeições para um diário alimentar brasileiro.',
                'Liste somente alimentos ou preparações que estejam visíveis. Não invente ingredientes ocultos.',
                'Estime a porção com números positivos, preferindo gramas (g) quando houver base visual suficiente e unidades brasileiras quando isso for mais natural.',
                'Para pratos mistos que não possam ser separados visualmente, use o nome da preparação como um único item.',
                'Não calcule calorias ou macronutrientes. Não dê orientação médica ou dietética.',
                'Reduza a confiança quando não houver escala, o alimento estiver parcialmente oculto ou a preparação puder conter óleo, açúcar, molhos ou recheios não visíveis.',
                'A nota deve resumir as principais incertezas. A pergunta deve solicitar, em uma frase curta, a informação mais importante que falta; deixe-a vazia se nada relevante faltar.',
                'Responda em português do Brasil.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Identifique os alimentos desta refeição e estime as porções visíveis para que o usuário possa revisar.' },
            { type: 'input_image', image_url: imageUrl, detail: 'high' },
          ],
        },
      ],
      text: { format: zodTextFormat(MealImageAnalysis, 'meal_image_analysis') },
    })
    if (!result.output_parsed) return json({ error: 'NO_ANALYSIS', message: 'Não conseguimos identificar alimentos nessa foto. Tente outra imagem ou descreva a refeição.' }, 422)
    return json({ ...result.output_parsed, model })
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500
    console.error('analyze-meal-image', status, error instanceof Error ? error.message : error)
    return json(
      { error: 'OPENAI_REQUEST_FAILED', message: status === 429 ? 'Limite temporário da análise de imagens atingido.' : 'Não foi possível analisar a foto agora.' },
      status >= 400 && status < 600 ? status : 500,
    )
  }
})
