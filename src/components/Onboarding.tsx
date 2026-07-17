import { useState } from 'react'
import { Activity, Armchair, ArrowLeft, ArrowRight, Check, Dumbbell, Footprints, HeartPulse, Leaf, Package, PersonStanding, Ruler, Scale, Sparkles, Target, Timer, UserRound } from 'lucide-react'
import type { BiologicalSex, DailyActivity, Goal, Intensity, Profile } from '../types'
import { Logo } from './Logo'

interface Props { onComplete: (profile: Profile) => void; cloudStorage?: boolean; onSignOut?: () => void }

const goals: { id: Goal; title: string; text: string; icon: typeof Target }[] = [
  { id: 'lose', title: 'Perder peso', text: 'Déficit calórico equilibrado', icon: Target },
  { id: 'maintain', title: 'Manter o peso', text: 'Energia e rotina em equilíbrio', icon: HeartPulse },
  { id: 'gain', title: 'Ganhar massa', text: 'Superávit para hipertrofia', icon: Dumbbell },
]

const dailyActivities: { id: DailyActivity; title: string; text: string; icon: typeof Target }[] = [
  { id: 'sedentary', title: 'Maior parte sentado', text: 'Trabalho no computador e pouca movimentação durante o dia.', icon: Armchair },
  { id: 'light', title: 'Movimento leve', text: 'Levanto algumas vezes e faço pequenas caminhadas.', icon: PersonStanding },
  { id: 'active', title: 'Ando bastante', text: 'Passo boa parte do dia em pé ou caminhando.', icon: Footprints },
  { id: 'heavy', title: 'Trabalho físico', text: 'Carrego peso ou faço esforço físico frequente.', icon: Package },
]

export function Onboarding({ onComplete, cloudStorage = false, onSignOut }: Props) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<Profile>({
    name: '', age: 30, height: 170, weight: 70, sex: 'female', goal: 'lose', dailyActivity: 'sedentary', workoutsPerWeek: 3, workoutMinutes: 50, intensity: 'moderate', theme: 'nature',
  })
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setData(prev => ({ ...prev, [key]: value }))
  const canContinue = step !== 0 || data.name.trim().length >= 2

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <Logo />
        <div className="onboarding-account"><span className="safe-note"><Leaf size={15} /> {cloudStorage ? 'Seus dados ficam sincronizados com segurança' : 'Seus dados ficam salvos neste dispositivo'}</span>{onSignOut && <button type="button" className="button secondary" onClick={onSignOut}>Sair</button>}</div>
      </header>
      <main className="onboarding-main">
        <div className="stepper" aria-label={`Etapa ${step + 1} de 5`}>
          {[0, 1, 2, 3, 4].map(item => <span key={item} className={item <= step ? 'active' : ''} />)}
        </div>

        {step === 0 && (
          <section className="onboarding-card intro-step">
            <div className="eyebrow"><Sparkles size={15} /> Vamos começar</div>
            <h1>Uma meta que se adapta à <em>sua vida.</em></h1>
            <p>Conte um pouco sobre você. Em menos de dois minutos, criamos seu primeiro plano alimentar personalizado.</p>
            <label className="field featured-field">
              <span>Como podemos chamar você?</span>
              <div className="input-with-icon"><UserRound size={20} /><input autoFocus placeholder="Seu primeiro nome" value={data.name} onChange={event => set('name', event.target.value)} /></div>
            </label>
          </section>
        )}

        {step === 1 && (
          <section className="onboarding-card">
            <div className="eyebrow"><Activity size={15} /> Seu corpo</div>
            <h1>Vamos calcular sua <em>necessidade diária.</em></h1>
            <p>Usamos estes dados apenas para estimar seu gasto energético e seus macronutrientes.</p>
            <div className="form-grid">
              <label className="field"><span>Idade</span><div className="input-with-suffix"><input type="number" min="14" max="100" value={data.age} onChange={event => set('age', Number(event.target.value))} /><b>anos</b></div></label>
              <label className="field"><span>Altura</span><div className="input-with-icon"><Ruler size={19} /><input type="number" min="120" max="230" value={data.height} onChange={event => set('height', Number(event.target.value))} /><b>cm</b></div></label>
              <label className="field"><span>Peso atual</span><div className="input-with-icon"><Scale size={19} /><input type="number" min="35" max="300" step="0.1" value={data.weight} onChange={event => set('weight', Number(event.target.value))} /><b>kg</b></div></label>
              <label className="field"><span>Sexo biológico <small>(para o cálculo)</small></span><select value={data.sex} onChange={event => set('sex', event.target.value as BiologicalSex)}><option value="female">Feminino</option><option value="male">Masculino</option></select></label>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="onboarding-card">
            <div className="eyebrow"><Target size={15} /> Seu objetivo</div>
            <h1>O que você quer <em>conquistar?</em></h1>
            <p>Seu objetivo define o ajuste inicial de calorias. Você poderá alterá-lo quando quiser.</p>
            <div className="choice-grid goals-grid">
              {goals.map(goal => { const Icon = goal.icon; return (
                <button key={goal.id} type="button" className={`choice-card ${data.goal === goal.id ? 'selected' : ''}`} onClick={() => set('goal', goal.id)}>
                  <span className="choice-icon"><Icon size={22} /></span><strong>{goal.title}</strong><small>{goal.text}</small>{data.goal === goal.id && <span className="selected-check"><Check size={14} /></span>}
                </button>
              )})}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="onboarding-card">
            <div className="eyebrow"><Footprints size={15} /> Seu dia a dia</div>
            <h1>Quanto você se movimenta <em>fora dos treinos?</em></h1>
            <p>Considere trabalho, deslocamentos e tarefas rotineiras. O exercício será calculado separadamente.</p>
            <div className="choice-grid activity-grid">
              {dailyActivities.map(activity => { const Icon = activity.icon; return (
                <button key={activity.id} type="button" className={`choice-card ${data.dailyActivity === activity.id ? 'selected' : ''}`} onClick={() => set('dailyActivity', activity.id)}>
                  <span className="choice-icon"><Icon size={22} /></span><strong>{activity.title}</strong><small>{activity.text}</small>{data.dailyActivity === activity.id && <span className="selected-check"><Check size={14} /></span>}
                </button>
              )})}
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="onboarding-card">
            <div className="eyebrow"><Dumbbell size={15} /> Sua rotina</div>
            <h1>Como são os seus <em>treinos?</em></h1>
            <p>Nos dias em que você treinar, sua meta recebe calorias extras automaticamente.</p>
            <div className="routine-block">
              <div className="slider-header"><div><Dumbbell size={20} /><span>Treinos por semana</span></div><strong>{data.workoutsPerWeek}x</strong></div>
              <input className="range" type="range" min="0" max="7" value={data.workoutsPerWeek} onChange={event => set('workoutsPerWeek', Number(event.target.value))} />
              <div className="range-labels"><span>Nenhum</span><span>Todos os dias</span></div>
            </div>
            <div className="form-grid routine-grid">
              <label className="field"><span><Timer size={16} /> Duração média</span><div className="input-with-suffix"><input type="number" min="10" max="240" value={data.workoutMinutes} onChange={event => set('workoutMinutes', Number(event.target.value))} /><b>min</b></div></label>
              <label className="field"><span><Activity size={16} /> Intensidade</span><select value={data.intensity} onChange={event => set('intensity', event.target.value as Intensity)}><option value="light">Leve</option><option value="moderate">Moderada</option><option value="intense">Intensa</option></select></label>
            </div>
          </section>
        )}

        <div className="onboarding-actions">
          <button type="button" className="button ghost" disabled={step === 0} onClick={() => setStep(value => value - 1)}><ArrowLeft size={18} /> Voltar</button>
          {step < 4 ? <button type="button" className="button primary" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Continuar <ArrowRight size={18} /></button>
            : <button type="button" className="button primary" onClick={() => onComplete({ ...data, name: data.name.trim() })}>Criar meu plano <Sparkles size={18} /></button>}
        </div>
      </main>
      <footer>VivaMeta é uma ferramenta educativa e não substitui o acompanhamento de nutricionista ou médico.</footer>
    </div>
  )
}
