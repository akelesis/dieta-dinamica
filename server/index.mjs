import dotenv from 'dotenv'
import express from 'express'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createFoodCache } from './food-cache.mjs'

// Em desenvolvimento, o .env local é a fonte de verdade. Em produção, sem
// arquivo .env, as variáveis fornecidas pela plataforma continuam valendo.
dotenv.config({ override: true })

const app = express()
const port = Number(process.env.API_PORT || 8787)
const apiKey = process.env.OPENAI_API_KEY?.trim()
const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.6'
const openai = apiKey ? new OpenAI({ apiKey }) : null
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDatabasePath = process.env.FOOD_CACHE_DB?.trim() || path.join(root, 'data', 'vivameta.sqlite')
const foodCache = createFoodCache(cacheDatabasePath)

const FoodEstimate = z.object({
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  })).max(20),
  totalCalories: z.number().nonnegative(),
  confidence: z.enum(['low', 'medium', 'high']),
  note: z.string(),
})

app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, openaiConfigured: Boolean(openai), model, foodCache: foodCache.stats() })
})

app.get('/api/food/cache/stats', (_request, response) => response.json(foodCache.stats()))

app.post('/api/food/estimate', async (request, response) => {
  const description = typeof request.body?.description === 'string' ? request.body.description.trim() : ''
  if (description.length < 3 || description.length > 1000) {
    return response.status(400).json({ error: 'INVALID_DESCRIPTION', message: 'Descreva a refeição em até 1.000 caracteres.' })
  }

  const cached = foodCache.get(description)
  if (cached) {
    return response.json({
      ...cached.value,
      model: cached.sourceModel,
      cached: true,
      cache: {
        hit: true,
        hitCount: cached.hitCount,
        strategy: cached.canonical.strategy,
      },
    })
  }

  if (!openai) {
    return response.status(503).json({
      error: 'OPENAI_NOT_CONFIGURED',
      message: 'Configure OPENAI_API_KEY no arquivo .env e reinicie o servidor.',
    })
  }

  try {
    const result = await openai.responses.parse({
      model,
      input: [
        {
          role: 'system',
          content: [
            'Você estima calorias e macronutrientes de refeições descritas em português do Brasil.',
            'Extraia cada alimento, quantidade e unidade. Considere receitas e porções brasileiras comuns.',
            'Para cada item, informe proteína, carboidratos e gorduras em gramas, além das calorias.',
            'Quando a quantidade ou receita não estiver clara, use uma porção típica e marque confiança baixa ou média.',
            'Calorias devem ser números inteiros aproximados. A soma de items.calories deve ser totalCalories.',
            'A nota deve ser curta, em português, e explicar a principal suposição sem dar aconselhamento médico.',
          ].join(' '),
        },
        { role: 'user', content: description },
      ],
      text: { format: zodTextFormat(FoodEstimate, 'food_estimate') },
    })

    if (!result.output_parsed) {
      return response.status(422).json({ error: 'NO_ESTIMATE', message: 'Não foi possível estimar essa refeição.' })
    }

    const canonical = foodCache.set(description, result.output_parsed, model)
    return response.json({
      ...result.output_parsed,
      model,
      cached: false,
      cache: { hit: false, hitCount: 0, strategy: canonical.strategy },
    })
  } catch (error) {
    const status = Number(error?.status) || 500
    console.error('OpenAI estimate failed:', error?.message || error)
    return response.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'OPENAI_REQUEST_FAILED',
      message: status === 401
        ? 'A chave da OpenAI foi recusada. Confira OPENAI_API_KEY no arquivo .env.'
        : status === 429
          ? 'Limite temporário da OpenAI atingido. Tente novamente em instantes.'
          : 'Não foi possível consultar a OpenAI agora.',
    })
  }
})

const dist = path.join(root, 'dist')
app.use(express.static(dist))
app.get('/{*path}', (request, response, next) => {
  if (request.path.startsWith('/api/')) return next()
  response.sendFile(path.join(dist, 'index.html'), error => error && next())
})

app.listen(port, '127.0.0.1', () => {
  console.log(`VivaMeta API em http://127.0.0.1:${port} · OpenAI ${openai ? 'configurada' : 'não configurada'}`)
})
