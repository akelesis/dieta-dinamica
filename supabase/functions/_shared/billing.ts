import Stripe from 'npm:stripe@^22'
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'

export type BillingPlan = 'self' | 'guided'

export function stripeClient() {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error('STRIPE_NOT_CONFIGURED')
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })
}

export function serviceRoleKey() {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined }
  catch { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = serviceRoleKey() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED')
  return createClient(url, key)
}

export function priceFor(plan: BillingPlan) {
  return Deno.env.get(plan === 'self' ? 'STRIPE_BASIC_PRICE_ID' : 'STRIPE_GUIDED_PRICE_ID')
}

export function planForPrice(priceId: string | null | undefined): BillingPlan | null {
  if (priceId && priceId === Deno.env.get('STRIPE_BASIC_PRICE_ID')) return 'self'
  if (priceId && priceId === Deno.env.get('STRIPE_GUIDED_PRICE_ID')) return 'guided'
  return null
}

export function appUrl() {
  return (Deno.env.get('APP_URL') || '').replace(/\/$/, '')
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || ''
  const configured = appUrl()
  const allowed = origin === configured || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? origin : configured,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export async function authenticatedUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : data.user
}
