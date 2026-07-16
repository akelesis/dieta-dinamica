import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { Logo } from './components/Logo'
import { Onboarding } from './components/Onboarding'
import { deletePlanPreferences, deleteUserData, loadUserState, replaceDayLog, upsertPlanPreferences, upsertProfile } from './lib/supabase-data'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { DayLog, PlanPreferences, Profile } from './types'

const PROFILE_KEY = 'vivameta:profile'
const LOGS_KEY = 'vivameta:logs'
const PLAN_KEY = 'vivameta:plan-preferences'
const today = () => new Date().toISOString().slice(0, 10)

function readLocal<T>(key: string): T | null {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : null } catch { return null }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => isSupabaseConfigured ? null : readLocal<Profile>(PROFILE_KEY))
  const [editing, setEditing] = useState(false)
  const [logs, setLogs] = useState<Record<string, DayLog>>(() => isSupabaseConfigured ? {} : readLocal<Record<string, DayLog>>(LOGS_KEY) || {})
  const [planPreferences, setPlanPreferences] = useState<PlanPreferences | null>(() => isSupabaseConfigured ? null : readLocal<PlanPreferences>(PLAN_KEY))
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const date = today()
  const log = logs[date] || { date, workoutDone: false, entries: [] }

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
        setPlanPreferences(state.planPreferences)
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
    setProfile(next)
    setEditing(false)
    if (session) queueRemote(() => upsertProfile(session.user.id, next))
    else {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
    }
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
    else localStorage.removeItem(PLAN_KEY)
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
    }
  }

  async function signOut() {
    await saveQueue.current
    await supabase?.auth.signOut()
  }

  if (!authReady || (session && loadedUserId !== session.user.id)) {
    return <div className="app-loading"><Logo /><span>Carregando seus dados…</span></div>
  }
  if (isSupabaseConfigured && !session) return <AuthScreen />
  if (!profile || editing) {
    return <><Onboarding onComplete={saveProfile} cloudStorage={Boolean(session)} />{syncStatus === 'error' && <div className="sync-toast error">{syncMessage}</div>}</>
  }
  return <Dashboard profile={profile} log={log} planPreferences={planPreferences} onLogChange={saveLog} onPlanComplete={savePlanPreferences} onResetPlan={resetPlanPreferences} onEditProfile={() => setEditing(true)} onReset={reset} onSignOut={session ? signOut : undefined} syncStatus={syncStatus} syncMessage={syncMessage} />
}
