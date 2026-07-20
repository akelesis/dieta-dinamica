import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { Logo } from './components/Logo'
import { Onboarding } from './components/Onboarding'
import { NutritionistDashboard } from './components/NutritionistDashboard'
import { PricingScreen } from './components/PlanExperience'
import { PwaManager } from './components/PwaManager'
import { isSubscriptionActive } from './lib/billing'
import { deletePlanPreferences, deleteUserData, loadUserState, replaceDayLog, upsertPlanPreferences, upsertProfile } from './lib/supabase-data'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { AppTheme, DayLog, PlanMode, PlanPreferences, Profile, Subscription } from './types'

const PROFILE_KEY = 'vivameta:profile'
const LOGS_KEY = 'vivameta:logs'
const PLAN_KEY = 'vivameta:plan-preferences'
const THEME_KEY = 'vivameta:theme'
const THEME_COLORS: Record<AppTheme, string> = {
  nature: '#173f35',
  ocean: '#123f50',
  terracotta: '#63372d',
  lavender: '#493663',
  dark: '#111917',
  'lilac-night': '#17121f',
}
const today = () => new Date().toISOString().slice(0, 10)

function readLocal<T>(key: string): T | null {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : null } catch { return null }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => isSupabaseConfigured ? null : readLocal<Profile>(PROFILE_KEY))
  const [editing, setEditing] = useState(false)
  const [logs, setLogs] = useState<Record<string, DayLog>>(() => isSupabaseConfigured ? {} : readLocal<Record<string, DayLog>>(LOGS_KEY) || {})
  const [planPreferences, setPlanPreferences] = useState<PlanPreferences | null>(() => isSupabaseConfigured ? null : readLocal<PlanPreferences>(PLAN_KEY))
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [role, setRole] = useState<'user' | 'nutritionist'>('user')
  const [betaPlan, setBetaPlan] = useState<PlanMode | null>(null)
  const [billingEnabled, setBillingEnabled] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [theme, setTheme] = useState<AppTheme>(() => readLocal<AppTheme>(THEME_KEY) || 'nature')
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const date = today()
  const log = logs[date] || { date, workoutDone: false, entries: [] }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'dark' || theme === 'lilac-night' ? 'dark' : 'light'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
    localStorage.setItem(THEME_KEY, JSON.stringify(theme))
  }, [theme])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAuthReady(true)
      if (!nextSession) {
        setProfile(null)
        setPlanPreferences(null)
        setSubscription(null)
        setRole('user')
        setBetaPlan(null)
        setBillingEnabled(false)
        setLogs({})
        setLoadedUserId(null)
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true
    loadUserState(session.user.id, date)
      .then(state => {
        if (!active) return
        setProfile(state.profile)
        setRole(state.role)
        if (state.profile?.theme) setTheme(state.profile.theme)
        setPlanPreferences(state.planPreferences)
        setSubscription(state.subscription)
        setBetaPlan(state.betaPlan)
        setBillingEnabled(state.billingEnabled)
        setLogs({ [date]: state.log })
        setSyncStatus('idle')
        setSyncMessage('')
      })
      .catch(error => {
        if (!active) return
        setSyncStatus('error')
        setSyncMessage(error instanceof Error ? error.message : 'Não foi possível carregar seus dados.')
      })
      .finally(() => { if (active) setLoadedUserId(session.user.id) })
    return () => { active = false }
  }, [session, date])

  function queueRemote(operation: () => Promise<void>) {
    setSyncStatus('saving')
    setSyncMessage('')
    saveQueue.current = saveQueue.current
      .then(operation)
      .then(() => setSyncStatus('idle'))
      .catch(error => {
        setSyncStatus('error')
        setSyncMessage(error instanceof Error ? error.message : 'Não foi possível sincronizar os dados.')
      })
  }

  function saveProfile(next: Profile) {
    const themedProfile = { ...next, theme }
    setProfile(themedProfile)
    setEditing(false)
    if (session) queueRemote(() => upsertProfile(session.user.id, themedProfile))
    else {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(themedProfile))
    }
  }

  function saveTheme(nextTheme: AppTheme) {
    setTheme(nextTheme)
    if (!profile) return
    const nextProfile = { ...profile, theme: nextTheme }
    setProfile(nextProfile)
    if (session) queueRemote(() => upsertProfile(session.user.id, nextProfile))
    else localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile))
  }

  function saveLog(next: DayLog) {
    const updated = { ...logs, [date]: next }
    setLogs(updated)
    if (session) queueRemote(() => replaceDayLog(session.user.id, next))
    else localStorage.setItem(LOGS_KEY, JSON.stringify(updated))
  }

  function savePlanPreferences(next: PlanPreferences) {
    setPlanPreferences(next)
    if (session) queueRemote(() => upsertPlanPreferences(session.user.id, next))
    else localStorage.setItem(PLAN_KEY, JSON.stringify(next))
  }

  function resetPlanPreferences() {
    setPlanPreferences(null)
    if (session) queueRemote(() => deletePlanPreferences(session.user.id))
    else {
      localStorage.removeItem(PLAN_KEY)
      localStorage.removeItem('vivameta:self-planner')
    }
  }

  function reset() {
    if (!window.confirm('Deseja apagar seu perfil, seu plano e todos os registros do diário?')) return
    setProfile(null)
    setLogs({})
    setPlanPreferences(null)
    if (session) queueRemote(() => deleteUserData(session.user.id))
    else {
      localStorage.removeItem(PROFILE_KEY)
      localStorage.removeItem(LOGS_KEY)
      localStorage.removeItem(PLAN_KEY)
      localStorage.removeItem('vivameta:self-planner')
    }
  }

  async function signOut() {
    await saveQueue.current
    await supabase?.auth.signOut()
  }

  const withPwa = (content: ReactNode) => <>{content}<PwaManager /></>

  if (!authReady || (session && loadedUserId !== session.user.id)) {
    return withPwa(<div className="app-loading"><Logo /><span>Carregando seus dados…</span></div>)
  }
  if (isSupabaseConfigured && !session) return withPwa(<AuthScreen />)
  if (role === 'nutritionist' && session) return withPwa(<NutritionistDashboard onSignOut={signOut} />)
  if (!profile) {
    return withPwa(<><Onboarding onComplete={saveProfile} cloudStorage={Boolean(session)} onSignOut={session ? signOut : undefined} />{syncStatus === 'error' && <div className="sync-toast error">{syncMessage}</div>}</>)
  }
  if (billingEnabled && !isSubscriptionActive(subscription) && !betaPlan) {
    return withPwa(<div className="subscription-gate-shell">
      <header className="subscription-gate-header"><Logo /><div><span>{session?.user.email}</span>{session && <button className="button secondary" onClick={signOut}>Sair</button>}</div></header>
      <main className="subscription-gate-main"><PricingScreen subscription={subscription} onSubscriptionChange={setSubscription} /></main>
      <footer>O acesso ao VivaMeta é liberado após a confirmação da assinatura.</footer>
    </div>)
  }
  if (editing) {
    return withPwa(<><Onboarding onComplete={saveProfile} initialProfile={profile} cloudStorage={Boolean(session)} onSignOut={session ? signOut : undefined} />{syncStatus === 'error' && <div className="sync-toast error">{syncMessage}</div>}</>)
  }
  return withPwa(<Dashboard profile={profile} log={log} planPreferences={planPreferences} subscription={subscription} betaPlan={betaPlan} onSubscriptionChange={setSubscription} billingEnabled={billingEnabled} theme={theme} onThemeChange={saveTheme} onLogChange={saveLog} onPlanComplete={savePlanPreferences} onResetPlan={resetPlanPreferences} onEditProfile={() => setEditing(true)} onReset={reset} onSignOut={session ? signOut : undefined} syncStatus={syncStatus} syncMessage={syncMessage} />)
}
