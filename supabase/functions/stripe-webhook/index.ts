import Stripe from 'npm:stripe@^22'
import { adminClient, planForPrice, stripeClient } from '../_shared/billing.ts'

const cryptoProvider = Stripe.createSubtleCryptoProvider()

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const signature = request.headers.get('Stripe-Signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!signature || !webhookSecret) return new Response('Webhook not configured', { status: 503 })

  let event: Stripe.Event
  try {
    const body = await request.text()
    event = await stripeClient().webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider)
  } catch (error) {
    console.error('stripe-webhook signature', error)
    return new Response('Invalid signature', { status: 400 })
  }

  if (!['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const subscription = event.data.object as Stripe.Subscription
    const firstItem = subscription.items.data[0]
    const priceId = firstItem?.price?.id || null
    const planMode = planForPrice(priceId)
    if (!planMode) {
      console.error('stripe-webhook unknown price', priceId)
      return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const userId = subscription.metadata.supabase_user_id || null
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    const periodEnd = firstItem && 'current_period_end' in firstItem
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null
    const { error } = await adminClient().rpc('process_stripe_subscription_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_user_id: userId,
      p_customer_id: customerId,
      p_subscription_id: subscription.id,
      p_price_id: priceId,
      p_plan_mode: planMode,
      p_status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
      p_current_period_end: periodEnd,
      p_cancel_at_period_end: subscription.cancel_at_period_end,
    })
    if (error) throw error
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('stripe-webhook processing', error)
    return new Response('Webhook processing failed', { status: 500 })
  }
})
