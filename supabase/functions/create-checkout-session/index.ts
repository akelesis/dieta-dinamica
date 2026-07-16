import { adminClient, appUrl, authenticatedUser, corsHeaders, json, priceFor, stripeClient, type BillingPlan } from '../_shared/billing.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const user = await authenticatedUser(request)
    if (!user) return json(request, { error: 'UNAUTHORIZED', message: 'Entre na sua conta para assinar.' }, 401)

    const body = await request.json().catch(() => null) as { planMode?: BillingPlan } | null
    const planMode = body?.planMode
    if (planMode !== 'self' && planMode !== 'guided') {
      return json(request, { error: 'INVALID_PLAN', message: 'Selecione um plano válido.' }, 400)
    }

    const price = priceFor(planMode)
    const returnUrl = appUrl()
    if (!price || !returnUrl) {
      return json(request, { error: 'BILLING_NOT_CONFIGURED', message: 'A cobrança ainda não foi configurada pelo administrador.' }, 503)
    }

    const admin = adminClient()
    const { data: existing, error: lookupError } = await admin.from('subscriptions')
      .select('stripe_customer_id, status, plan_mode, checkout_url, checkout_expires_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (existing && ['active', 'trialing'].includes(existing.status)) {
      return json(request, { error: 'ACTIVE_SUBSCRIPTION', message: 'Você já possui uma assinatura. Use o portal para gerenciá-la.' }, 409)
    }
    if (existing?.status === 'incomplete' && existing.plan_mode === planMode && existing.checkout_url && existing.checkout_expires_at && new Date(existing.checkout_expires_at).getTime() > Date.now()) {
      return json(request, { url: existing.checkout_url, reused: true })
    }

    const stripe = stripeClient()
    let customerId = existing?.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
    }

    const { error: pendingError } = await admin.from('subscriptions').upsert({
      user_id: user.id,
      stripe_customer_id: customerId,
      plan_mode: planMode,
      status: 'incomplete',
    })
    if (pendingError) throw pendingError

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      payment_method_types: ['card'],
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${returnUrl}/?checkout=success`,
      cancel_url: `${returnUrl}/?checkout=cancelled`,
      metadata: { supabase_user_id: user.id, plan_mode: planMode },
      subscription_data: { metadata: { supabase_user_id: user.id, plan_mode: planMode } },
    })

    if (!session.url) throw new Error('CHECKOUT_URL_MISSING')
    const { error: sessionSaveError } = await admin.from('subscriptions').update({
      stripe_checkout_session_id: session.id,
      checkout_url: session.url,
      checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
    }).eq('user_id', user.id)
    if (sessionSaveError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      throw sessionSaveError
    }

    return json(request, { url: session.url })
  } catch (error) {
    console.error('create-checkout-session', error)
    const unavailable = error instanceof Error && error.message === 'STRIPE_NOT_CONFIGURED'
    return json(request, {
      error: unavailable ? 'BILLING_NOT_CONFIGURED' : 'CHECKOUT_FAILED',
      message: unavailable ? 'A cobrança ainda não foi configurada pelo administrador.' : 'Não foi possível abrir o pagamento agora.',
    }, unavailable ? 503 : 500)
  }
})
