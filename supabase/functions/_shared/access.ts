import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.110.5'

export type AccessPlan = 'self' | 'guided'

export interface AccessEntitlement {
  billingEnabled: boolean
  planMode: AccessPlan | null
  source: 'subscription' | 'beta' | 'billing_disabled' | null
}

export async function accessForUser(admin: SupabaseClient, user: User): Promise<AccessEntitlement> {
  const [billingResult, subscriptionResult, betaResult] = await Promise.all([
    admin.from('billing_configuration').select('enabled').eq('singleton', true).maybeSingle(),
    admin.from('subscriptions').select('status, plan_mode').eq('user_id', user.id).maybeSingle(),
    user.email
      ? admin.from('beta_access_emails').select('plan_mode, active, expires_at').eq('email', user.email.toLowerCase()).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const error = billingResult.error || subscriptionResult.error || betaResult.error
  if (error) throw error
  if (!billingResult.data?.enabled) return { billingEnabled: false, planMode: null, source: 'billing_disabled' }

  const subscription = subscriptionResult.data
  if (subscription && ['active', 'trialing'].includes(subscription.status)) {
    return { billingEnabled: true, planMode: subscription.plan_mode as AccessPlan, source: 'subscription' }
  }

  const beta = betaResult.data
  const betaCurrent = beta?.active && (!beta.expires_at || new Date(beta.expires_at).getTime() > Date.now())
  if (betaCurrent) return { billingEnabled: true, planMode: beta.plan_mode as AccessPlan, source: 'beta' }
  return { billingEnabled: true, planMode: null, source: null }
}
