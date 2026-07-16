import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Calculator, Check, Clock3, Info, LoaderCircle, Plus, Salad, Target, Trash2 } from 'lucide-react'
import { estimateFoodWithOpenAI } from '../lib/openai'
import { createSelfPlannerPlan, loadSelfPlannerPlan, saveSelfPlannerPlan } from '../lib/self-plan'
import type { NutritionPlan, PlanPreferences, Profile, SelfPlanItem, SelfPlannerPlan } from '../types'

interface Props {
  profile: Profile
  nutrition: NutritionPlan
  preferences: PlanPreferences
  onReset: () => void
}

const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const rounded = (value: number) => Math.round(value * 10) / 10

export function SelfPlanner({ profile, nutrition, preferences, onReset }: Props) {
  const [plan, setPlan] = useState<SelfPlannerPlan | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyMeal, setBusyMeal] = useState('')
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    let active = true
    loadSelfPlannerPlan()
      .then(stored => { if (active) { setPlan(stored || createSelfPlannerPlan(preferences)); setSaveStatus(stored ? 'saved' : 'saving') } })
      .catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar seu planejador.'); setPlan(createSelfPlannerPlan(preferences)); setSaveStatus('saving') } })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [preferences])

  useEffect(() => {
    if (!loaded || !plan) return
    const timer = window.setTimeout(() => {
      saveSelfPlannerPlan(plan)
        .then(() => setSaveStatus('saved'))
        .catch(reason => { setSaveStatus('error'); setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o planejador.') })
    }, 550)
    return () => window.clearTimeout(timer)
  }, [loaded, plan])

  const totals = useMemo(() => (plan?.meals || []).flatMap(meal => meal.items).reduce((sum, item) => ({
    calories: sum.calories + item.calories,
    protein: sum.protein + item.protein,
    carbs: sum.carbs + item.carbs,
    fat: sum.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [plan])

  const target = nutrition.restTarget
  const calorieDifference = Math.round(totals.calories - target)
  const percentage = target ? Math.round(totals.calories / target * 100) : 0
  const status = totals.calories > target ? 'over' : totals.calories >= target * .95 ? 'within' : 'under'

  function updatePlan(transform: (current: SelfPlannerPlan) => SelfPlannerPlan) {
    setPlan(current => current ? { ...transform(current), updatedAt: new Date().toISOString() } : current)
    setSaveStatus('saving')
    setError('')
  }

  async function addFoods(mealId: string) {
    const description = (drafts[mealId] || '').trim()
    if (!description) return
    setBusyMeal(mealId)
    setError('')
    try {
      const estimate = await estimateFoodWithOpenAI(description)
      const items: SelfPlanItem[] = estimate.items.map(item => ({
        id: id(), name: item.name, quantity: item.quantity, unit: item.unit, calories: item.calories,
        protein: Number(item.protein || 0), carbs: Number(item.carbs || 0), fat: Number(item.fat || 0),
      }))
      updatePlan(current => ({ ...current, meals: current.meals.map(meal => meal.id === mealId ? { ...meal, items: [...meal.items, ...items] } : meal) }))
      setDrafts(current => ({ ...current, [mealId]: '' }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível estimar esses alimentos.')
    } finally { setBusyMeal('') }
  }

  function removeItem(mealId: string, itemId: string) {
    updatePlan(current => ({ ...current, meals: current.meals.map(meal => meal.id === mealId ? { ...meal, items: meal.items.filter(item => item.id !== itemId) } : meal) }))
  }

  function changeQuantity(mealId: string, itemId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) return
    updatePlan(current => ({
      ...current,
      meals: current.meals.map(meal => meal.id !== mealId ? meal : {
        ...meal,
        items: meal.items.map(item => {
          if (item.id !== itemId) return item
          const factor = quantity / item.quantity
          return { ...item, quantity, calories: Math.round(item.calories * factor), protein: rounded(item.protein * factor), carbs: rounded(item.carbs * factor), fat: rounded(item.fat * factor) }
        }),
      }),
    }))
  }

  function addMeal() {
    updatePlan(current => ({ ...current, meals: [...current.meals, { id: id(), label: `Refeição ${current.meals.length + 1}`, time: '18:00', items: [] }] }))
  }

  function removeMeal(mealId: string) {
    if (!plan || plan.meals.length <= 1) return
    updatePlan(current => ({ ...current, meals: current.meals.filter(meal => meal.id !== mealId) }))
  }

  if (!plan) return <div className="plan-generation-state"><LoaderCircle className="spin" size={25} /><strong>Carregando seu planejador…</strong></div>

  return <>
    <header className="page-header plan-page-header self-planner-header"><div><span className="date-label"><Calculator size={15} /> Plano básico · criado por você</span><h1>Planejador alimentar</h1><p>{profile.name.split(' ')[0]}, monte suas próprias refeições e acompanhe estimativas de calorias e macros.</p></div><button className="button secondary" onClick={onReset}>Revisar estrutura</button></header>

    <div className="self-planner-notice"><Info size={18} /><div><strong>Você decide o que entra no planejamento</strong><span>O VivaMeta apenas estima os valores nutricionais e compara com referências matemáticas. Não criamos nem prescrevemos refeições nesta modalidade.</span></div></div>

    <section className="plan-hero self-planner-hero card"><div><span className="card-kicker"><Target size={16} /> Referência diária estimada</span><h2>{target.toLocaleString('pt-BR')} <small>kcal / dia</small></h2><p>Em dias com treino, a referência estimada passa para <strong>{nutrition.activeTarget.toLocaleString('pt-BR')} kcal</strong>.</p></div><div className="macro-summary"><div><strong>{nutrition.protein}g</strong><span>proteínas</span></div><div><strong>{nutrition.carbs}g</strong><span>carboidratos</span></div><div><strong>{nutrition.fat}g</strong><span>gorduras</span></div></div></section>

    <section className={`calorie-comparison card ${status}`}>
      <div className="calorie-comparison-heading"><div><span><Calculator size={17} /></span><div><strong>Seu planejamento atual</strong><small>Os totais mudam sempre que você edita uma refeição.</small></div></div><b>{percentage}% da referência</b></div>
      <div className="calorie-comparison-values"><div><small>Referência estimada</small><strong>{target.toLocaleString('pt-BR')} <span>kcal</span></strong></div><div><small>Total planejado</small><strong>{Math.round(totals.calories).toLocaleString('pt-BR')} <span>kcal</span></strong></div><div><small>Diferença</small><strong>{calorieDifference === 0 ? 'Referência atingida' : `${Math.abs(calorieDifference).toLocaleString('pt-BR')} kcal ${calorieDifference > 0 ? 'acima' : 'abaixo'}`}</strong></div></div>
      <div className="self-macro-progress"><div><span>Proteínas</span><b>{rounded(totals.protein)} / {nutrition.protein}g</b><i><em style={{ width: `${Math.min(100, totals.protein / Math.max(1, nutrition.protein) * 100)}%` }} /></i></div><div><span>Carboidratos</span><b>{rounded(totals.carbs)} / {nutrition.carbs}g</b><i><em style={{ width: `${Math.min(100, totals.carbs / Math.max(1, nutrition.carbs) * 100)}%` }} /></i></div><div><span>Gorduras</span><b>{rounded(totals.fat)} / {nutrition.fat}g</b><i><em style={{ width: `${Math.min(100, totals.fat / Math.max(1, nutrition.fat) * 100)}%` }} /></i></div></div>
    </section>

    <section className="meal-plan self-meal-plan">
      <div className="section-heading"><div><span className="section-icon"><Salad size={19} /></span><div><h2>Refeições planejadas</h2><p>Adicione os alimentos como pretende consumi-los. Ex.: “100g de arroz e 120g de frango grelhado”.</p></div></div><div className="plan-state-badges"><span className={`plan-save-status ${saveStatus}`}>{saveStatus === 'saving' && <LoaderCircle className="spin" size={12} />}{saveStatus === 'saved' && <Check size={12} />}{saveStatus === 'error' && <AlertCircle size={12} />}{saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'saved' ? 'Planejamento salvo' : saveStatus === 'error' ? 'Erro ao salvar' : 'Salvamento automático'}</span></div></div>
      <div className="self-meal-list">{plan.meals.map(meal => {
        const mealTotals = meal.items.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein: sum.protein + item.protein, carbs: sum.carbs + item.carbs, fat: sum.fat + item.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
        return <article className="self-meal-card" key={meal.id}>
          <div className="self-meal-head"><div className="self-meal-identity"><input aria-label="Nome da refeição" value={meal.label} onChange={event => updatePlan(current => ({ ...current, meals: current.meals.map(item => item.id === meal.id ? { ...item, label: event.target.value } : item) }))} /><label><Clock3 size={13} /><input type="time" value={meal.time} onChange={event => updatePlan(current => ({ ...current, meals: current.meals.map(item => item.id === meal.id ? { ...item, time: event.target.value } : item) }))} /></label></div><div className="self-meal-total"><strong>{Math.round(mealTotals.calories)} kcal</strong><span>{rounded(mealTotals.protein)}g P · {rounded(mealTotals.carbs)}g C · {rounded(mealTotals.fat)}g G</span></div><button className="self-delete-meal" type="button" disabled={plan.meals.length <= 1} aria-label={`Excluir ${meal.label}`} onClick={() => removeMeal(meal.id)}><Trash2 size={15} /></button></div>
          {meal.items.length === 0 ? <div className="self-meal-empty"><span>Esta refeição ainda está vazia.</span><small>Você escolhe todos os alimentos.</small></div> : <ul className="self-food-list">{meal.items.map(item => <li key={item.id}><div><strong>{item.name}</strong><span>{item.calories} kcal · {rounded(item.protein)}g P · {rounded(item.carbs)}g C · {rounded(item.fat)}g G</span></div><label><input type="number" min="0.1" step="0.1" value={item.quantity} aria-label={`Quantidade de ${item.name}`} onChange={event => changeQuantity(meal.id, item.id, Number(event.target.value))} /><span>{item.unit}</span></label><button type="button" aria-label={`Remover ${item.name}`} onClick={() => removeItem(meal.id, item.id)}><Trash2 size={14} /></button></li>)}</ul>}
          <div className="self-add-food"><input value={drafts[meal.id] || ''} disabled={busyMeal === meal.id} placeholder="Descreva os alimentos e quantidades" onChange={event => setDrafts(current => ({ ...current, [meal.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') void addFoods(meal.id) }} /><button type="button" disabled={!drafts[meal.id]?.trim() || Boolean(busyMeal)} onClick={() => addFoods(meal.id)}>{busyMeal === meal.id ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Adicionar</button></div>
        </article>
      })}</div>
      <button className="button secondary self-add-meal" type="button" onClick={addMeal}><Plus size={16} /> Adicionar outra refeição</button>
      {error && <div className="inline-plan-error"><AlertCircle size={15} /> {error}</div>}
    </section>

    <div className="health-disclaimer"><Info size={19} /><p><strong>Estimativas não são prescrição dietética.</strong> Os valores podem variar conforme marca, preparo e porção real. Para um plano individualizado ou orientação relacionada a condições de saúde, procure um nutricionista.</p></div>
  </>
}
