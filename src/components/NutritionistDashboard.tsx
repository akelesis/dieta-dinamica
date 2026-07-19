import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, Check, ChevronRight, ClipboardList, Clock3, LoaderCircle, LogOut, Plus, Save, ShieldCheck, Trash2, UserRoundSearch } from 'lucide-react'
import type { GeneratedNutritionPlan, PlanIngredient } from '../types'
import { normalizeGeneratedPlan } from '../lib/generated-plan'
import { approveNutritionistReview, getNutritionistReview, listNutritionistReviews, saveNutritionistReview, type NutritionistReview } from '../lib/nutritionist-reviews'
import { Logo } from './Logo'

const statusLabel = { pending: 'Aguardando revisão', in_review: 'Em revisão', approved: 'Aprovada' }
const goalLabel: Record<string, string> = { lose: 'Perda de peso', maintain: 'Manutenção', gain: 'Ganho de massa' }
const availabilityLabel: Record<string, string> = { comfortable: '30 min ou mais', limited: '15 a 30 min', very_limited: 'até 15 min/no trabalho' }
const emptyIngredient = (): PlanIngredient => ({ name: 'Novo alimento', quantity: 100, unit: 'g', householdMeasure: '1 porção', calories: 0 })

function normalizedPlan(plan: GeneratedNutritionPlan) {
  const normalized = normalizeGeneratedPlan(plan)
  return { ...normalized, menus: normalized.menus.map(menu => ({ ...menu, meals: menu.meals.map(meal => ({ ...meal, preparation: undefined })) })) }
}

export function NutritionistDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [reviews, setReviews] = useState<NutritionistReview[]>([])
  const [selected, setSelected] = useState<NutritionistReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'approve' | ''>('')
  const [error, setError] = useState('')

  const loadQueue = useCallback(() => {
    setLoading(true); setError('')
    listNutritionistReviews().then(setReviews).catch(reason => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a fila.')).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(loadQueue, 0)
    return () => window.clearTimeout(timer)
  }, [loadQueue])

  async function openReview(id: string) {
    setLoading(true); setError('')
    try { setSelected(await getNutritionistReview(id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a revisão.') }
    finally { setLoading(false) }
  }

  function setPlan(next: GeneratedNutritionPlan) { if (selected) setSelected({ ...selected, plan: normalizedPlan(next) }) }
  function updateMeal(menuIndex: number, mealIndex: number, field: string, value: string | number) {
    if (!selected) return
    const menus = selected.plan.menus.map((menu, index) => index !== menuIndex ? menu : { ...menu, meals: menu.meals.map((meal, index) => index === mealIndex ? { ...meal, [field]: value } : meal) })
    setPlan({ ...selected.plan, menus })
  }
  function updateIngredient(menuIndex: number, mealIndex: number, ingredientIndex: number, field: keyof PlanIngredient, value: string | number) {
    if (!selected) return
    const menus = selected.plan.menus.map((menu, index) => index !== menuIndex ? menu : { ...menu, meals: menu.meals.map((meal, index) => index !== mealIndex ? meal : { ...meal, ingredients: meal.ingredients.map((item, itemIndex) => itemIndex === ingredientIndex ? { ...item, [field]: value } : item) }) })
    setPlan({ ...selected.plan, menus })
  }
  function removeIngredient(menuIndex: number, mealIndex: number, ingredientIndex: number) {
    if (!selected) return
    const menus = selected.plan.menus.map((menu, index) => index !== menuIndex ? menu : { ...menu, meals: menu.meals.map((meal, index) => index !== mealIndex ? meal : { ...meal, ingredients: meal.ingredients.filter((_, itemIndex) => itemIndex !== ingredientIndex) }) })
    setPlan({ ...selected.plan, menus })
  }
  function addIngredient(menuIndex: number, mealIndex: number) {
    if (!selected) return
    const menus = selected.plan.menus.map((menu, index) => index !== menuIndex ? menu : { ...menu, meals: menu.meals.map((meal, index) => index !== mealIndex ? meal : { ...meal, ingredients: [...meal.ingredients, emptyIngredient()] }) })
    setPlan({ ...selected.plan, menus })
  }
  function removeMeal(menuIndex: number, mealIndex: number) {
    if (!selected) return
    setPlan({ ...selected.plan, menus: selected.plan.menus.map((menu, index) => index !== menuIndex ? menu : { ...menu, meals: menu.meals.filter((_, index) => index !== mealIndex) }) })
  }
  function addMeal(menuIndex: number) {
    if (!selected) return
    setPlan({ ...selected.plan, menus: selected.plan.menus.map((menu, index) => index !== menuIndex ? menu : { ...menu, meals: [...menu.meals, { label: 'Nova refeição', time: '12:00', title: 'Nova refeição', ingredients: [emptyIngredient()], calories: 0, protein: 0, carbs: 0, fat: 0 }] }) })
  }

  async function persist(approve: boolean) {
    if (!selected) return
    if (approve && !window.confirm('Aprovar esta dieta e gerar os modos de preparo com os ingredientes confirmados?')) return
    setBusy(approve ? 'approve' : 'save'); setError('')
    try {
      const next = approve ? await approveNutritionistReview(selected.id, normalizedPlan(selected.plan)) : await saveNutritionistReview(selected.id, normalizedPlan(selected.plan))
      if (approve) { setSelected(null); loadQueue() } else setSelected(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a revisão.') }
    finally { setBusy('') }
  }

  return <div className="nutritionist-shell">
    <header className="nutritionist-header"><Logo /><div className="nutritionist-header-actions"><span><ShieldCheck size={16} /> Painel profissional</span><button className="button secondary" onClick={onSignOut}><LogOut size={15} /> Sair</button></div></header>
    <main className="nutritionist-main">
      {!selected ? <>
        <section className="nutritionist-title"><div><span><ClipboardList size={19} /></span><div><small>Revisão clínica anonimizada</small><h1>Fila de dietas</h1><p>Nenhum nome, e-mail ou identificador do usuário é exibido.</p></div></div><b>{reviews.length} {reviews.length === 1 ? 'caso pendente' : 'casos pendentes'}</b></section>
        {loading ? <div className="review-empty"><LoaderCircle className="spin" size={25} /> Carregando fila…</div> : reviews.length === 0 ? <div className="review-empty"><BadgeCheck size={30} /><h2>Fila revisada</h2><p>Não há dietas aguardando aprovação.</p></div> : <div className="review-queue">{reviews.map(review => <button key={review.id} className="review-queue-card" onClick={() => openReview(review.id)}><span className={`review-status ${review.status}`}>{statusLabel[review.status]}</span><strong>{review.caseCode}</strong><div><span>{review.context.profile.age} anos</span><span>{goalLabel[review.context.profile.goal] || review.context.profile.goal}</span><span>{review.plan.dailyCalories} kcal</span><span>{review.context.preferences.mealsPerDay} refeições</span></div><small><Clock3 size={13} /> Recebida em {new Date(review.submittedAt).toLocaleString('pt-BR')}</small><ChevronRight size={19} /></button>)}</div>}
      </> : <ReviewEditor review={selected} onBack={() => { setSelected(null); loadQueue() }} onPlan={setPlan} updateMeal={updateMeal} updateIngredient={updateIngredient} removeIngredient={removeIngredient} addIngredient={addIngredient} removeMeal={removeMeal} addMeal={addMeal} busy={busy} onSave={() => persist(false)} onApprove={() => persist(true)} />}
      {error && <div className="nutritionist-error">{error}</div>}
    </main>
  </div>
}

function ReviewEditor({ review, onBack, onPlan, updateMeal, updateIngredient, removeIngredient, addIngredient, removeMeal, addMeal, busy, onSave, onApprove }: { review: NutritionistReview; onBack: () => void; onPlan: (plan: GeneratedNutritionPlan) => void; updateMeal: (menu: number, meal: number, field: string, value: string | number) => void; updateIngredient: (menu: number, meal: number, ingredient: number, field: keyof PlanIngredient, value: string | number) => void; removeIngredient: (menu: number, meal: number, ingredient: number) => void; addIngredient: (menu: number, meal: number) => void; removeMeal: (menu: number, meal: number) => void; addMeal: (menu: number) => void; busy: string; onSave: () => void; onApprove: () => void }) {
  const [activeMenuIndex, setActiveMenuIndex] = useState(0)
  const { profile, nutrition, preferences } = review.context
  const dailyTarget = nutrition.dailyTarget ?? nutrition.restTarget ?? 0
  const activeMenu = review.plan.menus[activeMenuIndex] || review.plan.menus[0]
  return <>
    <div className="review-editor-header"><button className="button ghost" onClick={onBack}><ArrowLeft size={16} /> Voltar à fila</button><div><span className={`review-status ${review.status}`}>{statusLabel[review.status]}</span><h1>{review.caseCode}</h1><p>Revise os três cardápios antes de aprovar. Os preparos só serão gerados depois da aprovação conjunta.</p></div><div><button className="button secondary" disabled={Boolean(busy)} onClick={onSave}>{busy === 'save' ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Salvar revisão</button><button className="button primary" disabled={Boolean(busy) || review.plan.menus.length !== 3} onClick={onApprove}>{busy === 'approve' ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Aprovar dieta</button></div></div>
    <section className="anonymous-context card"><div className="anonymous-context-title"><UserRoundSearch size={20} /><div><strong>Contexto clínico anonimizado</strong><span>Dados identificáveis foram removidos.</span></div></div><div className="context-grid"><span><small>Perfil</small><b>{profile.age} anos · {profile.sex === 'female' ? 'Feminino' : 'Masculino'} · {profile.height} cm · {profile.weight} kg</b></span><span><small>Objetivo</small><b>{goalLabel[profile.goal] || profile.goal}</b></span><span><small>Rotina</small><b>{profile.dailyActivity} · {profile.workoutsPerWeek} treinos/semana · {profile.workoutMinutes} min</b></span><span><small>Horário usual de treino</small><b>{preferences.workoutTime || 'Não informado/sem treino'}</b></span><span><small>Meta diária média</small><b>{dailyTarget} kcal · P {nutrition.protein}g · C {nutrition.carbs}g · G {nutrition.fat}g</b></span><span><small>Média dos treinos</small><b>{nutrition.weeklyWorkoutCalories != null ? `${nutrition.weeklyWorkoutCalories} kcal/semana · ${nutrition.averageWorkoutCalories || 0} kcal/dia` : 'Contexto calculado pela fórmula anterior'}</b></span><span><small>Disponibilidade para refeições</small><b>Café: {availabilityLabel[preferences.breakfastAvailability || 'comfortable']} · Almoço: {availabilityLabel[preferences.lunchAvailability || 'comfortable']} · Jantar: {availabilityLabel[preferences.dinnerAvailability || 'comfortable']}</b></span><span><small>Estilo e orçamento</small><b>{preferences.dietaryStyle} · {preferences.budget} · preparo {preferences.cookingTime}</b></span><span><small>Restrições</small><b>{preferences.restrictions?.join(', ') || 'Nenhuma'}</b></span><span><small>Condições de saúde</small><b>{preferences.healthConditions?.join(', ') || 'Nenhuma informada'}</b></span><span><small>Alimentos</small><b>Prefere: {preferences.favoriteFoods || 'não informado'} · Evita: {preferences.dislikedFoods || 'não informado'}</b></span>{preferences.healthNotes && <span className="context-wide"><small>Observações sanitizadas</small><b>{preferences.healthNotes}</b></span>}</div></section>
    <section className="review-plan-summary card"><label><span>Resumo do plano</span><textarea value={review.plan.summary} onChange={event => onPlan({ ...review.plan, summary: event.target.value })} /></label><div><span><small>Média dos cardápios</small><b>{review.plan.dailyCalories} kcal</b></span><span><small>Cardápio selecionado</small><b>{activeMenu.dailyCalories} kcal · P {activeMenu.protein}g · C {activeMenu.carbs}g · G {activeMenu.fat}g</b></span></div></section>
    <div className="menu-option-tabs professional" role="tablist" aria-label="Cardápios para revisão">{review.plan.menus.map((menu, menuIndex) => <button key={menu.id} type="button" role="tab" aria-selected={menuIndex === activeMenuIndex} className={menuIndex === activeMenuIndex ? 'active' : ''} onClick={() => setActiveMenuIndex(menuIndex)}><span>Cardápio {menu.id}</span><small>{menu.dailyCalories} kcal · {menu.meals.length} refeições</small></button>)}</div>
    {review.plan.menus.length !== 3 && <div className="nutritionist-error">Este caso foi criado no formato antigo e precisa receber os cardápios B e C antes da aprovação.</div>}
    <div className="review-meal-list">{activeMenu.meals.map((meal, mealIndex) => <article className="review-meal-card card" key={mealIndex}><div className="review-meal-heading"><input value={meal.label} aria-label={`Nome da refeição ${mealIndex + 1} do cardápio ${activeMenu.id}`} onChange={event => updateMeal(activeMenuIndex, mealIndex, 'label', event.target.value)} /><input type="time" value={meal.time} aria-label={`Horário da refeição ${mealIndex + 1} do cardápio ${activeMenu.id}`} onChange={event => updateMeal(activeMenuIndex, mealIndex, 'time', event.target.value)} /><input value={meal.title} aria-label={`Título da refeição ${mealIndex + 1} do cardápio ${activeMenu.id}`} onChange={event => updateMeal(activeMenuIndex, mealIndex, 'title', event.target.value)} /><button aria-label={`Excluir refeição ${mealIndex + 1} do cardápio ${activeMenu.id}`} onClick={() => removeMeal(activeMenuIndex, mealIndex)}><Trash2 size={16} /></button></div><div className="review-ingredients">{meal.ingredients.map((item, ingredientIndex) => <div className="review-ingredient-row" key={ingredientIndex}><input value={item.name} aria-label="Alimento" onChange={event => updateIngredient(activeMenuIndex, mealIndex, ingredientIndex, 'name', event.target.value)} /><input type="number" min="0.1" step="0.1" value={item.quantity} aria-label="Quantidade" onChange={event => updateIngredient(activeMenuIndex, mealIndex, ingredientIndex, 'quantity', Number(event.target.value))} /><select value={item.unit} aria-label="Unidade" onChange={event => updateIngredient(activeMenuIndex, mealIndex, ingredientIndex, 'unit', event.target.value)}>{['g','ml','unidade','fatia','colher de sopa','colher de chá','xícara','pote'].map(unit => <option key={unit}>{unit}</option>)}</select><input value={item.householdMeasure} aria-label="Medida caseira" onChange={event => updateIngredient(activeMenuIndex, mealIndex, ingredientIndex, 'householdMeasure', event.target.value)} /><input type="number" min="0" value={item.calories} aria-label="Calorias" onChange={event => updateIngredient(activeMenuIndex, mealIndex, ingredientIndex, 'calories', Number(event.target.value))} /><button aria-label={`Excluir ${item.name}`} onClick={() => removeIngredient(activeMenuIndex, mealIndex, ingredientIndex)}><Trash2 size={14} /></button></div>)}</div><button className="review-add-row" onClick={() => addIngredient(activeMenuIndex, mealIndex)}><Plus size={14} /> Adicionar alimento</button><div className="review-meal-macros"><label>Proteína <input type="number" min="0" value={meal.protein} onChange={event => updateMeal(activeMenuIndex, mealIndex, 'protein', Number(event.target.value))} /></label><label>Carboidratos <input type="number" min="0" value={meal.carbs} onChange={event => updateMeal(activeMenuIndex, mealIndex, 'carbs', Number(event.target.value))} /></label><label>Gorduras <input type="number" min="0" value={meal.fat} onChange={event => updateMeal(activeMenuIndex, mealIndex, 'fat', Number(event.target.value))} /></label><strong>{meal.calories} kcal</strong></div></article>)}</div><button className="button secondary review-add-meal" onClick={() => addMeal(activeMenuIndex)}><Plus size={16} /> Adicionar refeição ao Cardápio {activeMenu.id}</button>
  </>
}
