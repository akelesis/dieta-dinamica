import { useMemo, useState } from 'react'
import { Activity, Apple, CalendarDays, Check, ChevronRight, CircleUserRound, Clock3, Droplets, Dumbbell, Flame, Home, Info, Leaf, Menu, Moon, MoreHorizontal, Palette, Pencil, Plus, Salad, Settings, Sparkles, SunMedium, Trash2, TrendingUp, UtensilsCrossed, Waves, X } from 'lucide-react'
import { calculatePlan, consumedMacros, dailyActivityLabels, goalLabels, intensityLabels } from '../lib/nutrition'
import type { AppTheme, DayLog, MealEntry, PlanPreferences, Profile } from '../types'
import { AddMealModal } from './AddMealModal'
import { Logo } from './Logo'
import { PlanExperience } from './PlanExperience'

interface Props {
  profile: Profile
  log: DayLog
  planPreferences: PlanPreferences | null
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  onLogChange: (log: DayLog) => void
  onPlanComplete: (preferences: PlanPreferences) => void
  onResetPlan: () => void
  onEditProfile: () => void
  onReset: () => void
  onSignOut?: () => void
  syncStatus?: 'idle' | 'saving' | 'error'
  syncMessage?: string
}

type View = 'today' | 'plan' | 'profile'
const dayLabel = () => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())

const themes: { id: AppTheme; title: string; description: string; icon: typeof Leaf; colors: string[] }[] = [
  { id: 'nature', title: 'Natureza', description: 'Verde sereno e acolhedor', icon: Leaf, colors: ['#17483b', '#c7dc66', '#f7f8f4'] },
  { id: 'ocean', title: 'Oceano', description: 'Azul fresco e equilibrado', icon: Waves, colors: ['#164e63', '#67e8f9', '#f0f8fa'] },
  { id: 'terracotta', title: 'Terracota', description: 'Quente, suave e orgânico', icon: SunMedium, colors: ['#7c3f2e', '#e6a15c', '#fbf5ef'] },
  { id: 'dark', title: 'Noturno', description: 'Escuro e confortável', icon: Moon, colors: ['#111c1a', '#8fcf79', '#1a2724'] },
]

function ProgressRing({ value, total }: { value: number; total: number }) {
  const ratio = Math.min(value / total, 1)
  const circumference = 2 * Math.PI * 76
  return (
    <div className="calorie-ring">
      <svg viewBox="0 0 180 180"><circle className="ring-bg" cx="90" cy="90" r="76" /><circle className="ring-value" cx="90" cy="90" r="76" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} /></svg>
      <div><small>Consumidas</small><strong>{value.toLocaleString('pt-BR')}</strong><span>de {total.toLocaleString('pt-BR')} kcal</span></div>
    </div>
  )
}

export function Dashboard({ profile, log, planPreferences, theme, onThemeChange, onLogChange, onPlanComplete, onResetPlan, onEditProfile, onReset, onSignOut, syncStatus = 'idle', syncMessage = '' }: Props) {
  const [view, setView] = useState<View>('today')
  const [mealModal, setMealModal] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const plan = useMemo(() => calculatePlan(profile), [profile])
  const target = log.workoutDone ? plan.activeTarget : plan.restTarget
  const consumed = log.entries.reduce((sum, entry) => sum + entry.calories, 0)
  const macrosConsumed = useMemo(() => consumedMacros(log.entries), [log.entries])
  const proteinProgress = Math.min(macrosConsumed.protein / Math.max(plan.protein, 1) * 100, 100)
  const carbsProgress = Math.min(macrosConsumed.carbs / Math.max(plan.carbs, 1) * 100, 100)
  const remaining = Math.max(target - consumed, 0)
  const over = Math.max(consumed - target, 0)
  const firstName = profile.name.split(' ')[0]

  function addMeal(entry: MealEntry) {
    onLogChange({ ...log, entries: [...log.entries, entry].sort((a, b) => a.time.localeCompare(b.time)) })
    setMealModal(false)
  }
  function removeMeal(id: string) { onLogChange({ ...log, entries: log.entries.filter(entry => entry.id !== id) }) }
  function toggleWorkout() { onLogChange({ ...log, workoutDone: !log.workoutDone }) }

  const nav = (destination: View) => { setView(destination); setMobileMenu(false) }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-top"><Logo /><button className="mobile-close icon-button" aria-label="Fechar menu" onClick={() => setMobileMenu(false)}><X size={20} /></button></div>
        <nav>
          <button className={view === 'today' ? 'active' : ''} onClick={() => nav('today')}><Home size={19} /> Hoje</button>
          <button className={view === 'plan' ? 'active' : ''} onClick={() => nav('plan')}><Salad size={19} /> Meu plano</button>
          <button className={view === 'profile' ? 'active' : ''} onClick={() => nav('profile')}><CircleUserRound size={19} /> Meu perfil</button>
        </nav>
        <div className="sidebar-insight"><span><Sparkles size={16} /></span><strong>Consistência vence perfeição.</strong><p>Cada registro ajuda você a entender melhor a sua rotina.</p></div>
        <div className="sidebar-profile"><div className="avatar">{firstName.slice(0, 1).toUpperCase()}</div><div><strong>{profile.name}</strong><span>{goalLabels[profile.goal]}</span></div><MoreHorizontal size={18} /></div>
      </aside>
      {mobileMenu && <div className="sidebar-scrim" onClick={() => setMobileMenu(false)} />}

      <main className="dashboard-main">
        <header className="mobile-header"><button className="icon-button" aria-label="Abrir menu" onClick={() => setMobileMenu(true)}><Menu size={21} /></button><Logo /><div className="avatar mini">{firstName.slice(0, 1).toUpperCase()}</div></header>
        {view === 'today' && (
          <>
            <header className="page-header"><div><span className="date-label"><CalendarDays size={15} /> {dayLabel()}</span><h1>Olá, {firstName}! <span>👋</span></h1><p>Seu dia está começando bem. Acompanhe sua meta abaixo.</p></div><button className="button primary add-meal-top" onClick={() => setMealModal(true)}><Plus size={18} /> Registrar refeição</button></header>

            <section className="overview-grid">
              <article className="card calories-card">
                <div className="card-heading"><div><span className="card-kicker"><Flame size={16} /> Meta de hoje</span><h2>{target.toLocaleString('pt-BR')} kcal</h2></div><span className={`status-pill ${log.workoutDone ? 'success' : ''}`}>{log.workoutDone ? 'Dia com treino' : 'Dia sem treino'}</span></div>
                <div className="calories-content"><ProgressRing value={consumed} total={target} /><div className="calorie-stats"><div><span className="dot consumed" /><p>Consumidas</p><strong>{consumed} <small>kcal</small></strong></div><div><span className="dot remaining" /><p>{over > 0 ? 'Acima da meta' : 'Restantes'}</p><strong>{over > 0 ? over : remaining} <small>kcal</small></strong></div></div></div>
                <div className="adaptive-note"><Info size={16} /><span>{log.workoutDone ? `Seu treino adicionou ${plan.workoutBonus} kcal à meta de hoje.` : `Ao concluir o treino, sua meta sobe ${plan.workoutBonus} kcal.`}</span></div>
              </article>

              <article className={`card workout-card ${log.workoutDone ? 'done' : ''}`}>
                <div className="workout-art"><span><Dumbbell size={28} /></span><span className="motion-line" /></div>
                <div className="workout-copy"><span className="card-kicker"><Activity size={16} /> Movimento do dia</span><h2>{log.workoutDone ? 'Treino concluído!' : 'Treino de hoje'}</h2><p>{profile.workoutMinutes} min · Intensidade {intensityLabels[profile.intensity].toLowerCase()}</p></div>
                <button className={`workout-toggle ${log.workoutDone ? 'checked' : ''}`} onClick={toggleWorkout}><span>{log.workoutDone && <Check size={16} />}</span><b>{log.workoutDone ? 'Marcar como não realizado' : 'Concluir treino'}</b></button>
                <div className="bonus-line"><Flame size={15} /> Vale +{plan.workoutBonus} kcal na meta de hoje</div>
              </article>
            </section>

            <section className="metrics-grid">
              <article className="metric-card"><span className="metric-icon protein"><TrendingUp size={20} /></span><div><small>Proteína {macrosConsumed.estimated && <em>estimada</em>}</small><strong>{macrosConsumed.protein} <span>/ {plan.protein}g</span></strong></div><div className="mini-progress protein"><i style={{ width: `${proteinProgress}%` }} /></div></article>
              <article className="metric-card"><span className="metric-icon carbs"><Apple size={20} /></span><div><small>Carboidratos {macrosConsumed.estimated && <em>estimados</em>}</small><strong>{macrosConsumed.carbs} <span>/ {plan.carbs}g</span></strong></div><div className="mini-progress carbs"><i style={{ width: `${carbsProgress}%` }} /></div></article>
              <article className="metric-card"><span className="metric-icon water"><Droplets size={20} /></span><div><small>Água sugerida</small><strong>{plan.water} <span>litros</span></strong></div><div className="mini-progress"><i style={{ width: '0%' }} /></div></article>
            </section>

            <section className="diary-section">
              <div className="section-heading"><div><span className="section-icon"><UtensilsCrossed size={19} /></span><div><h2>Diário alimentar</h2><p>{log.entries.length ? `${log.entries.length} ${log.entries.length === 1 ? 'registro hoje' : 'registros hoje'}` : 'Seu dia começa por aqui'}</p></div></div><button className="button secondary" onClick={() => setMealModal(true)}><Plus size={17} /> Adicionar</button></div>
              {log.entries.length === 0 ? (
                <div className="empty-diary"><span className="empty-illustration"><Leaf size={34} /><i>✦</i></span><h3>Ainda não há refeições registradas</h3><p>Conte o que você comeu e nós estimamos as calorias para você.</p><button className="text-button" onClick={() => setMealModal(true)}>Registrar primeira refeição <ChevronRight size={17} /></button></div>
              ) : (
                <div className="meal-list">{log.entries.map(entry => <article className="meal-row" key={entry.id}><div className="meal-time"><Clock3 size={15} /> {entry.time}</div><span className="meal-symbol">{entry.mealType.includes('Café') ? '☀️' : entry.mealType === 'Almoço' ? '🥗' : entry.mealType === 'Jantar' ? '🍲' : '🍎'}</span><div className="meal-copy"><small>{entry.mealType}</small><strong>{entry.description}</strong>{entry.breakdown.length > 0 && <span>{entry.breakdown.map(item => `${item.quantity} ${item.unit} de ${item.name.toLowerCase()}`).join(' + ')}</span>}</div><b className="meal-calories">{entry.calories} <small>kcal</small></b><button className="delete-meal" aria-label="Excluir refeição" onClick={() => removeMeal(entry.id)}><Trash2 size={17} /></button></article>)}</div>
              )}
            </section>
          </>
        )}

        {view === 'plan' && (
          <PlanExperience profile={profile} nutrition={plan} preferences={planPreferences} onComplete={onPlanComplete} onReset={onResetPlan} />
        )}

        {view === 'profile' && (
          <>
            <header className="page-header"><div><span className="date-label"><CircleUserRound size={15} /> Seus dados</span><h1>Meu perfil</h1><p>Mantenha seus dados atualizados para recalcular o plano.</p></div><button className="button primary" onClick={onEditProfile}><Pencil size={17} /> Editar perfil</button></header>
            <section className="profile-card card"><div className="profile-banner"><div className="profile-avatar">{firstName.slice(0, 1).toUpperCase()}</div><div><h2>{profile.name}</h2><span>{goalLabels[profile.goal]}</span></div></div><div className="profile-details"><div><small>Idade</small><strong>{profile.age} anos</strong></div><div><small>Altura</small><strong>{profile.height} cm</strong></div><div><small>Peso atual</small><strong>{profile.weight} kg</strong></div><div><small>Atividade cotidiana</small><strong>{dailyActivityLabels[profile.dailyActivity || 'light']}</strong></div><div><small>Frequência de treino</small><strong>{profile.workoutsPerWeek}x por semana</strong></div><div><small>Duração média</small><strong>{profile.workoutMinutes} minutos</strong></div><div><small>Intensidade do treino</small><strong>{intensityLabels[profile.intensity]}</strong></div></div></section>
            <section className="settings-section"><h2><Settings size={20} /> Preferências</h2><div className="theme-settings"><div className="theme-settings-heading"><span><Palette size={18} /></span><div><strong>Aparência do aplicativo</strong><small>Escolha o esquema de cores mais confortável para você.</small></div></div><div className="theme-grid" role="radiogroup" aria-label="Esquema de cores">{themes.map(option => { const Icon = option.icon; return <button key={option.id} type="button" role="radio" aria-checked={theme === option.id} className={`theme-option ${theme === option.id ? 'selected' : ''}`} onClick={() => onThemeChange(option.id)}><span className="theme-preview">{option.colors.map(color => <i key={color} style={{ background: color }} />)}</span><span className="theme-option-copy"><b><Icon size={15} /> {option.title}</b><small>{option.description}</small></span>{theme === option.id && <span className="theme-check"><Check size={13} /></span>}</button> })}</div></div><div className="settings-row"><div><strong>Recomeçar configuração</strong><span>Apaga seu perfil, plano e diário alimentar.</span></div><button className="button danger" onClick={onReset}>Apagar meus dados</button></div>{onSignOut && <div className="settings-row"><div><strong>Sair da conta</strong><span>Seus dados continuarão seguros para o próximo acesso.</span></div><button className="button secondary" onClick={onSignOut}>Sair</button></div>}</section>
          </>
        )}
      </main>
      {mealModal && <AddMealModal onClose={() => setMealModal(false)} onAdd={addMeal} />}
      {syncStatus !== 'idle' && <div className={`sync-toast ${syncStatus}`}>{syncStatus === 'saving' ? 'Salvando…' : syncMessage || 'Não foi possível sincronizar.'}</div>}
      {view === 'today' && <button className="mobile-fab" aria-label="Registrar refeição" onClick={() => setMealModal(true)}><Plus size={23} /></button>}
    </div>
  )
}
