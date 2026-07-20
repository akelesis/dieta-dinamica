import { createClient } from 'npm:@supabase/supabase-js@2.110.5'
import { accessForUser } from '../_shared/access.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

function secretKey() {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined }
  catch { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }
}

const allowedAudioTypes = new Set([
  'audio/flac', 'audio/mp3', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a', 'video/webm',
])

function normalizeTranscript(transcript: string) {
  const words = transcript.trim().split(/\s+/).filter(Boolean)
  return words.filter((word, index) => {
    if (index === 0) return true
    const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9À-ɏ]/gi, '')
    return !normalize(word) || normalize(word) !== normalize(words[index - 1])
  }).join(' ')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const auth = token ? await admin.auth.getUser(token) : null
    if (!auth?.data.user || auth.error) return json({ error: 'UNAUTHORIZED', message: 'Entre na sua conta para usar o ditado.' }, 401)
    const access = await accessForUser(admin, auth.data.user)
    if (access.billingEnabled && !access.planMode) {
      return json({ error: 'SUBSCRIPTION_REQUIRED', message: 'O registro por voz requer uma assinatura ativa.' }, 402)
    }

    const form = await request.formData().catch(() => null)
    const audio = form?.get('audio')
    if (!(audio instanceof File) || audio.size === 0) {
      return json({ error: 'AUDIO_REQUIRED', message: 'Grave uma descrição antes de solicitar a transcrição.' }, 400)
    }
    if (audio.size > 6 * 1024 * 1024) {
      return json({ error: 'AUDIO_TOO_LARGE', message: 'A gravação deve ter no máximo 6 MB.' }, 413)
    }
    const contentType = audio.type.split(';')[0].toLowerCase()
    if (!allowedAudioTypes.has(contentType)) {
      return json({ error: 'AUDIO_FORMAT_NOT_SUPPORTED', message: 'O formato de áudio enviado não é compatível.' }, 415)
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json({ error: 'OPENAI_NOT_CONFIGURED', message: 'A transcrição por voz ainda não foi configurada.' }, 503)
    const model = Deno.env.get('OPENAI_TRANSCRIPTION_MODEL') || 'gpt-4o-mini-transcribe'
    const transcriptionForm = new FormData()
    transcriptionForm.append('file', audio, audio.name || 'refeicao.webm')
    transcriptionForm.append('model', model)
    transcriptionForm.append('language', 'pt')
    transcriptionForm.append('prompt', 'Transcreva em português do Brasil uma descrição curta de alimentos, porções, medidas caseiras e bebidas consumidas. Preserve números e unidades. Remova repetições acidentais de palavras.')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: transcriptionForm,
    })
    const result = await response.json().catch(() => null) as { text?: string; error?: { message?: string } } | null
    if (!response.ok) {
      console.error('transcribe-meal OpenAI', response.status, result?.error?.message)
      return json({
        error: 'TRANSCRIPTION_FAILED',
        message: response.status === 429 ? 'O serviço de voz está temporariamente ocupado. Tente novamente em instantes.' : 'Não foi possível transcrever a gravação agora.',
      }, response.status === 429 ? 429 : 502)
    }
    const text = normalizeTranscript(result?.text?.slice(0, 1000) || '')
    if (!text) return json({ error: 'EMPTY_TRANSCRIPTION', message: 'Não conseguimos identificar fala nessa gravação.' }, 422)
    return json({ text, model })
  } catch (error) {
    console.error('transcribe-meal', error)
    return json({ error: 'TRANSCRIPTION_FAILED', message: 'Não foi possível transcrever a gravação agora.' }, 500)
  }
})
