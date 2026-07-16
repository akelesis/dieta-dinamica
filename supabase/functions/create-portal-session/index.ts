import { adminClient, appUrl, authenticatedUser, corsHeaders, json, stripeClient } from '../_shared/billing.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const user = await authenticatedUser(request)
    if (!user) return json(request, { error: 'UNAUTHORIZED', message: 'Entre na sua conta para gerenciar a assinatura.' }, 401)

    const admin = adminClient()
    const { data, error } = await admin.from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!data?.stripe_customer_id) {
      return json(request, { error: 'CUSTOMER_NOT_FOUND', message: 'Nenhuma assinatura foi encontrada para esta conta.' }, 404)
    }

    const returnUrl = appUrl()
    if (!returnUrl) return json(request, { error: 'BILLING_NOT_CONFIGURED', message: 'O retorno do portal ainda não foi configurado.' }, 503)
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${returnUrl}/`,
    })
    return json(request, { url: session.url })
  } catch (error) {
    console.error('create-portal-session', error)
    return json(request, { error: 'PORTAL_FAILED', message: 'Não foi possível abrir o portal da assinatura agora.' }, 500)
  }
})
