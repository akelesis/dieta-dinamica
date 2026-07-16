import type { PlanMode, Subscription } from '../types'
import { supabase } from './supabase'

export const isSubscriptionActive = (subscription: Subscription | null) =>
  subscription?.status === 'active' || subscription?.status === 'trialing'

async function invokeBillingFunction(name: string, body?: Record<string, unknown>) {
  if (!supabase) throw new Error('O Supabase não está configurado.')
  const { data, error } = await supabase.functions.invoke(name, { body: body || {} })
  if (error) {
    let message = error.message || 'Não foi possível iniciar a cobrança.'
    const response = (error as { context?: Response }).context
    if (response) {
      const payload = await response.clone().json().catch(() => null) as { message?: string } | null
      if (payload?.message) message = payload.message
    }
    throw new Error(message)
  }
  return data as { url?: string }
}

export async function startSubscriptionCheckout(planMode: PlanMode) {
  const { url } = await invokeBillingFunction('create-checkout-session', { planMode })
  if (!url) throw new Error('O Stripe não retornou uma página de pagamento.')
  window.location.assign(url)
}

export async function openBillingPortal() {
  const { url } = await invokeBillingFunction('create-portal-session')
  if (!url) throw new Error('O Stripe não retornou o portal da assinatura.')
  window.location.assign(url)
}

export async function loadCurrentSubscription(): Promise<Subscription | null> {
  if (!supabase) return null
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return null
  const { data, error } = await supabase.from('subscriptions')
    .select('plan_mode, status, current_period_end, cancel_at_period_end')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw error
  return data ? {
    planMode: data.plan_mode as PlanMode,
    status: data.status as Subscription['status'],
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  } : null
}
