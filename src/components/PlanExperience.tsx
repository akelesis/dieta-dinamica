import { useEffect, useState } from 'react'
import { Activity, AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Calculator, Check, ChefHat, Clock3, Coins, CreditCard, Crown, HeartPulse, Info, Leaf, LoaderCircle, LockKeyhole, Pencil, Plus, RefreshCw, Repeat2, Salad, ShieldCheck, Sparkles, Target, Trash2, UtensilsCrossed, WalletCards, X } from 'lucide-react'
import { isSubscriptionActive, loadCurrentSubscription, openBillingPortal, startSubscriptionCheckout } from '../lib/billing'
import { goalLabels } from '../lib/nutrition'
import { estimateFoodWithOpenAI } from '../lib/openai'
import { generateNutritionPlan, saveCustomizedNutritionPlan, suggestMealSwaps } from '../lib/plan-ai'
import type { DietaryStyle, FoodBudget, GeneratedMeal, GeneratedPlanResponse, HealthCondition, MealSwapSuggestion, NutritionPlan, PlanIngredient, PlanMode, PlanPreferences, Profile, Subscription } from '../types'
import { SelfPlanner } from './SelfPlanner'

interface Props {
  profile: Profile
  nutrition: NutritionPlan
  preferences: PlanPreferences | null
  subscription: Subscription | null
  billingEnabled: boolean
  onSubscriptionChange: (subscription: Subscription | null) => void
  onComplete: (preferences: PlanPreferences) => void
  onReset: () => void
}

const dietaryStyles: { id: DietaryStyle; icon: string; title: string; text: string }[] = [
  { id: 'omnivore', icon: '🍽️', title: 'Onívora', text: 'Inclui alimentos de origem animal e vegetal' },
  { id: 'vegetarian', icon: '🥚', title: 'Vegetariana', text: 'Sem carnes, podendo incluir ovos e laticínios' },
  { id: 'vegan', icon: '🌱', title: 'Vegana', text: 'Somente alimentos de origem vegetal' },
  { id: 'pescatarian', icon: '🐟', title: 'Pescetariana', text: 'Inclui peixes, ovos e alimentos vegetais' },
]

const restrictionOptions = ['Lactose', 'Glúten', 'Amendoim', 'Castanhas', 'Frutos do mar', 'Ovos', 'Soja']
const healthConditionOptions: { id: HealthCondition; label: string }[] = [
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'hypertension', label: 'Hipertensão' },
  { id: 'kidney_disease', label: 'Doença ou insuficiência renal' },
  { id: 'liver_disease', label: 'Doença hepática' },
  { id: 'heart_disease', label: 'Cardiopatia' },
  { id: 'other', label: 'Outra condição' },
]
const budgetLabels: Record<FoodBudget, string> = { economy: 'Econômico', balanced: 'Equilibrado', flexible: 'Flexível' }
const styleLabels: Record<DietaryStyle, string> = { omnivore: 'Onívora', vegetarian: 'Vegetariana', vegan: 'Vegana', pescatarian: 'Pescetariana' }

function PlanOnboarding({ profile, onComplete, forcedMode }: Pick<Props, 'profile' | 'onComplete'> & { forcedMode?: PlanMode }) {
  const [step, setStep] = useState(0)
  const [modeChosen, setModeChosen] = useState(Boolean(forcedMode))
  const [data, setData] = useState<Omit<PlanPreferences, 'completedAt'>>({
    planMode: forcedMode || 'self', dietaryStyle: 'omnivore', mealsPerDay: 4, restrictions: [], favoriteFoods: '', dislikedFoods: '', cookingTime: 'moderate', budget: 'balanced', breakfastTime: '07:30', lunchTime: '12:30', dinnerTime: '19:30', hasHealthCondition: false, healthConditions: [], healthNotes: '',
  })
  const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => setData(previous => ({ ...previous, [key]: value }))
  const toggleRestriction = (restriction: string) => set('restrictions', data.restrictions.includes(restriction) ? data.restrictions.filter(item => item !== restriction) : [...data.restrictions, restriction])
  const toggleHealthCondition = (condition: HealthCondition) => set('healthConditions', data.healthConditions.includes(condition) ? data.healthConditions.filter(item => item !== condition) : [...data.healthConditions, condition])
  const canContinue = step !== 1 || !data.hasHealthCondition || data.healthConditions.length > 0
  const finish = () => onComplete({ ...data, hasHealthCondition: data.planMode === 'guided' && data.hasHealthCondition, healthConditions: data.planMode === 'guided' && data.hasHealthCondition ? data.healthConditions : [], healthNotes: data.planMode === 'guided' && data.hasHealthCondition ? data.healthNotes.trim() : '', completedAt: new Date().toISOString() })

  const chooseMode = (planMode: PlanMode) => {
    setData(previous => ({ ...previous, planMode, hasHealthCondition: false, healthConditions: [], healthNotes: '' }))
    setModeChosen(true)
  }

  if (!modeChosen) return <section className="plan-onboarding plan-mode-onboarding">
    <div className="plan-onboarding-intro"><span className="date-label"><Salad size={15} /> Meu plano</span><h1>Como você quer organizar sua alimentação?</h1><p>Escolha a experiência mais adequada. Você poderá trocar de modalidade depois.</p></div>
    <div className="plan-mode-grid">
      <button type="button" className="plan-mode-card featured" onClick={() => chooseMode('self')}><span className="plan-mode-icon"><Calculator size={25} /></span><span className="plan-mode-badge">Plano básico</span><h2>Planejador pessoal</h2><p>Você monta cada refeição. O VivaMeta calcula calorias e macros para ajudar na organização das suas metas.</p><ul><li><Check size={14} /> Refeições totalmente editáveis</li><li><Check size={14} /> Estimativas nutricionais automáticas</li><li><Check size={14} /> Comparação com referências diárias</li></ul><strong>Montar por conta própria <ArrowRight size={16} /></strong></button>
      <button type="button" className="plan-mode-card" onClick={() => chooseMode('guided')}><span className="plan-mode-icon premium"><Crown size={25} /></span><span className="plan-mode-badge premium">Plano acompanhado</span><h2>Plano personalizado</h2><p>Mantém a experiência atual com refeições, porções e personalizações em uma estrutura individualizada.</p><ul><li><Check size={14} /> Plano alimentar estruturado</li><li><Check size={14} /> Sugestões de substituição</li><li><ShieldCheck size={14} /> Revisão profissional recomendada</li></ul><strong>Continuar para personalização <ArrowRight size={16} /></strong></button>
    </div>
    <div className="self-planner-notice compact"><Info size={17} /><div><strong>O plano básico é uma ferramenta de organização.</strong><span>Ele não escolhe alimentos nem cria uma dieta para você.</span></div></div>
  </section>

  return (
    <section className="plan-onboarding">
      <div className="plan-onboarding-intro">
        <span className="date-label">{data.planMode === 'self' ? <><Calculator size={15} /> Planejador pessoal</> : <><Sparkles size={15} /> Plano individualizado</>}</span>
        <h1>{data.planMode === 'self' ? `Prepare seu planejador, ${profile.name.split(' ')[0]}.` : `Vamos construir seu plano, ${profile.name.split(' ')[0]}.`}</h1>
        <p>{data.planMode === 'self' ? 'Defina apenas a estrutura da sua rotina; você escolherá todos os alimentos depois.' : 'Suas preferências transformam a meta calórica em uma rotina alimentar possível de seguir.'}</p>
      </div>
      <div className="plan-progress"><div><span>Etapa {step + 1} de 4</span><b>{['Alimentação', 'Cuidados', 'Rotina', 'Horários'][step]}</b></div><div className="plan-progress-track"><i style={{ width: `${(step + 1) * 25}%` }} /></div></div>

      <div className="plan-question-card">
        {step === 0 && <div className="plan-step"><span className="plan-step-icon"><Salad size={23} /></span><h2>Como é a sua alimentação?</h2><p>Escolha o estilo que mais representa sua rotina atual.</p><div className="diet-style-grid">{dietaryStyles.map(style => <button type="button" key={style.id} className={data.dietaryStyle === style.id ? 'selected' : ''} onClick={() => set('dietaryStyle', style.id)}><span>{style.icon}</span><div><strong>{style.title}</strong><small>{style.text}</small></div>{data.dietaryStyle === style.id && <i><Check size={13} /></i>}</button>)}</div></div>}

        {step === 1 && <div className="plan-step"><span className="plan-step-icon"><ShieldCheck size={23} /></span><h2>Existe algo que você evita?</h2><p>{data.planMode === 'self' ? 'Essas marcações ficam visíveis como lembrete pessoal no planejador.' : 'Marque alergias ou restrições. Você pode deixar tudo desmarcado.'}</p><div className="restriction-grid">{restrictionOptions.map(item => <button type="button" key={item} className={data.restrictions.includes(item) ? 'selected' : ''} onClick={() => toggleRestriction(item)}><span>{data.restrictions.includes(item) && <Check size={13} />}</span>{item}</button>)}</div>{data.planMode === 'guided' && <><div className="health-question"><div><HeartPulse size={20} /><span><strong>Possui condição de saúde ou usa medicação contínua?</strong><small>Essa informação define se a geração automática é segura.</small></span></div><div className="binary-choice"><button type="button" className={!data.hasHealthCondition ? 'selected' : ''} onClick={() => setData(previous => ({ ...previous, hasHealthCondition: false, healthConditions: [], healthNotes: '' }))}>Não</button><button type="button" className={data.hasHealthCondition ? 'selected' : ''} onClick={() => set('hasHealthCondition', true)}>Sim</button></div></div>{data.hasHealthCondition && <div className="health-condition-fields"><div><span className="field-label">Selecione a condição informada</span><div className="health-condition-grid">{healthConditionOptions.map(condition => <button type="button" key={condition.id} className={data.healthConditions.includes(condition.id) ? 'selected' : ''} onClick={() => toggleHealthCondition(condition.id)}><span>{data.healthConditions.includes(condition.id) && <Check size={12} />}</span>{condition.label}</button>)}</div></div>{data.healthConditions.includes('kidney_disease') && <div className="renal-safety-note"><AlertCircle size={17} /><div><strong>Esta condição exige plano clínico individualizado</strong><span>Não geraremos uma dieta renal automática sem estágio da doença, exames de potássio e orientação sobre diálise, proteína e líquidos.</span></div></div>}<label className="field"><span>Observação opcional para seu cadastro</span><textarea rows={2} placeholder="Não inclua exames, documentos ou outros dados sensíveis." value={data.healthNotes} onChange={event => set('healthNotes', event.target.value)} /></label></div>}</>}</div>}

        {step === 2 && <div className="plan-step"><span className="plan-step-icon"><ChefHat size={23} /></span><h2>Qual plano cabe na sua rotina?</h2><p>A melhor estratégia é aquela que você consegue repetir.</p><div className="plan-form-row"><div className="plan-control"><span><UtensilsCrossed size={16} /> Refeições por dia</span><div className="number-choice">{([3, 4, 5, 6] as const).map(number => <button key={number} className={data.mealsPerDay === number ? 'selected' : ''} onClick={() => set('mealsPerDay', number)}>{number}</button>)}</div></div><div className="plan-control"><span><Clock3 size={16} /> Tempo para cozinhar</span><div className="stack-choice"><button className={data.cookingTime === 'quick' ? 'selected' : ''} onClick={() => set('cookingTime', 'quick')}><b>Até 15 min</b><small>Praticidade acima de tudo</small></button><button className={data.cookingTime === 'moderate' ? 'selected' : ''} onClick={() => set('cookingTime', 'moderate')}><b>Até 30 min</b><small>Um pouco de preparo</small></button><button className={data.cookingTime === 'flexible' ? 'selected' : ''} onClick={() => set('cookingTime', 'flexible')}><b>Sem limite</b><small>Gosto de cozinhar</small></button></div></div></div><div className="budget-control"><span><Coins size={16} /> Orçamento para alimentação</span><div>{(['economy', 'balanced', 'flexible'] as const).map(item => <button key={item} className={data.budget === item ? 'selected' : ''} onClick={() => set('budget', item)}><WalletCards size={16} />{budgetLabels[item]}</button>)}</div></div></div>}

        {step === 3 && <div className="plan-step"><span className="plan-step-icon"><Clock3 size={23} /></span><h2>Últimos detalhes da sua rotina</h2><p>Use horários aproximados. O plano continua flexível.</p><div className="time-grid"><label className="field"><span>Café da manhã</span><input type="time" value={data.breakfastTime} onChange={event => set('breakfastTime', event.target.value)} /></label><label className="field"><span>Almoço</span><input type="time" value={data.lunchTime} onChange={event => set('lunchTime', event.target.value)} /></label><label className="field"><span>Jantar</span><input type="time" value={data.dinnerTime} onChange={event => set('dinnerTime', event.target.value)} /></label></div><div className="preference-grid"><label className="field"><span>Alimentos que você gosta</span><textarea rows={3} placeholder="Ex.: arroz, feijão, banana, frango..." value={data.favoriteFoods} onChange={event => set('favoriteFoods', event.target.value)} /></label><label className="field"><span>Alimentos que prefere evitar</span><textarea rows={3} placeholder="Ex.: brócolis, peixe, abacate..." value={data.dislikedFoods} onChange={event => set('dislikedFoods', event.target.value)} /></label></div><div className="plan-ready-note">{data.planMode === 'self' ? <Calculator size={18} /> : <Sparkles size={18} />}<div><strong>{data.planMode === 'self' ? 'Sua estrutura está pronta' : 'Tudo pronto para personalizar'}</strong><span>{data.planMode === 'self' ? 'Agora você poderá preencher e editar cada refeição por conta própria.' : 'Vamos combinar seu objetivo, gasto energético, rotina e preferências.'}</span></div></div></div>}
      </div>

      <div className="plan-onboarding-actions"><button className="button ghost" disabled={step === 0 && Boolean(forcedMode)} onClick={() => step === 0 ? setModeChosen(false) : setStep(value => value - 1)}><ArrowLeft size={17} /> Voltar</button>{step < 3 ? <button className="button primary" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Continuar <ArrowRight size={17} /></button> : <button className="button primary" onClick={finish}>{data.planMode === 'self' ? <>Abrir meu planejador <Calculator size={17} /></> : <>Construir meu plano <Sparkles size={17} /></>}</button>}</div>
    </section>
  )
}

function PricingScreen({ subscription, onSubscriptionChange }: Pick<Props, 'subscription' | 'onSubscriptionChange'>) {
  const checkoutState = new URLSearchParams(window.location.search).get('checkout')
  const [busy, setBusy] = useState<PlanMode | 'portal' | ''>('')
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(checkoutState === 'success')

  useEffect(() => {
    if (checkoutState !== 'success') return
    let active = true
    let attempts = 0
    const check = async () => {
      attempts += 1
      try {
        const next = await loadCurrentSubscription()
        if (!active) return
        onSubscriptionChange(next)
        if (isSubscriptionActive(next)) {
          setChecking(false)
          window.history.replaceState({}, '', window.location.pathname)
          return
        }
      } catch { /* O webhook pode ainda estar processando. */ }
      if (active && attempts < 10) window.setTimeout(check, 1200)
      else if (active) { setChecking(false); setMessage('O pagamento ainda está sendo confirmado. Atualize a página em alguns instantes.') }
    }
    void check()
    return () => { active = false }
  }, [checkoutState, onSubscriptionChange])

  async function subscribe(planMode: PlanMode) {
    setBusy(planMode)
    setMessage('')
    try { await startSubscriptionCheckout(planMode) }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível abrir o pagamento.'); setBusy('') }
  }

  async function manage() {
    setBusy('portal')
    setMessage('')
    try { await openBillingPortal() }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível abrir o portal.'); setBusy('') }
  }

  const basicPrice = import.meta.env.VITE_BASIC_PLAN_PRICE_LABEL || 'Preço no checkout'
  const guidedPrice = import.meta.env.VITE_GUIDED_PLAN_PRICE_LABEL || 'Preço no checkout'
  return <section className="billing-page">
    <div className="billing-intro"><span className="date-label"><CreditCard size={15} /> Assinatura VivaMeta</span><h1>Escolha como deseja planejar sua alimentação</h1><p>Pagamento recorrente por cartão processado pelo Stripe. O VivaMeta não recebe nem armazena os dados do seu cartão.</p></div>
    {checking && <div className="billing-status checking"><LoaderCircle className="spin" size={18} /><div><strong>Confirmando seu pagamento…</strong><span>Isso normalmente leva apenas alguns segundos.</span></div></div>}
    {checkoutState === 'cancelled' && <div className="billing-status"><Info size={18} /><div><strong>Pagamento cancelado</strong><span>Nenhuma cobrança foi concluída. Você pode tentar novamente quando quiser.</span></div></div>}
    {subscription && !isSubscriptionActive(subscription) && <div className="billing-status warning"><AlertCircle size={18} /><div><strong>Assinatura {subscription.status === 'past_due' ? 'com pagamento pendente' : 'inativa'}</strong><span>Regularize o pagamento no portal ou inicie uma nova assinatura.</span></div>{subscription.status !== 'incomplete' && <button className="button secondary" disabled={busy === 'portal'} onClick={manage}>{busy === 'portal' ? <LoaderCircle className="spin" size={15} /> : <CreditCard size={15} />} Gerenciar</button>}</div>}
    <div className="pricing-grid">
      <article className="pricing-card"><span className="pricing-icon"><Calculator size={24} /></span><span className="pricing-kicker">Plano básico</span><h2>Planejador pessoal</h2><strong className="pricing-price">{basicPrice}</strong><p>Você escolhe os alimentos e organiza as refeições com estimativas automáticas.</p><ul><li><Check size={15} /> Refeições totalmente editáveis</li><li><Check size={15} /> Calorias e macros estimados</li><li><Check size={15} /> Comparação com suas metas</li></ul><button className="button secondary" disabled={Boolean(busy) || checking} onClick={() => subscribe('self')}>{busy === 'self' ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} Assinar plano básico</button></article>
      <article className="pricing-card featured"><span className="pricing-recommended">Mais completo</span><span className="pricing-icon premium"><Crown size={24} /></span><span className="pricing-kicker">Plano personalizado</span><h2>Plano guiado por IA</h2><strong className="pricing-price">{guidedPrice}</strong><p>Receba uma estrutura alimentar individualizada e personalize refeições e trocas.</p><ul><li><Sparkles size={15} /> Plano com porções e preparo</li><li><Check size={15} /> Sugestões de substituição</li><li><Check size={15} /> Ajustes salvos na sua conta</li></ul><button className="button primary" disabled={Boolean(busy) || checking} onClick={() => subscribe('guided')}>{busy === 'guided' ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} Assinar plano personalizado</button></article>
    </div>
    {message && <div className="billing-error"><AlertCircle size={16} /> {message}</div>}
    <div className="billing-trust"><LockKeyhole size={18} /><div><strong>Checkout seguro do Stripe</strong><span>A ativação acontece somente após a confirmação do pagamento. Cancele pelo portal do cliente.</span></div></div>
  </section>
}

function SubscriptionBar({ subscription }: { subscription: Subscription }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const manage = async () => {
    setBusy(true); setError('')
    try { await openBillingPortal() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o portal.'); setBusy(false) }
  }
  return <div className="subscription-bar"><span><BadgeCheck size={17} /><div><strong>{subscription.planMode === 'self' ? 'Plano básico ativo' : 'Plano personalizado ativo'}</strong><small>{subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? `Acesso até ${new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}` : 'Assinatura ativa'}</small></div></span><button className="button secondary" disabled={busy} onClick={manage}>{busy ? <LoaderCircle className="spin" size={14} /> : <CreditCard size={14} />} Gerenciar assinatura</button>{error && <em>{error}</em>}</div>
}

const mealIcons: Record<string, string> = { 'Café da manhã': '☀️', 'Lanche da manhã': '🍎', 'Almoço': '🥗', 'Lanche da tarde': '🥜', 'Jantar': '🍲', 'Ceia': '🌙' }
const formatQuantity = (quantity: number) => quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const formatUnit = (unit: string, quantity: number) => {
  if (quantity === 1 || ['g', 'ml'].includes(unit)) return unit
  const plurals: Record<string, string> = { unidade: 'unidades', fatia: 'fatias', 'colher de sopa': 'colheres de sopa', 'colher de chá': 'colheres de chá', xícara: 'xícaras', pote: 'potes' }
  return plurals[unit] || unit
}

function rebuildMeal(meal: GeneratedMeal, ingredients: PlanIngredient[]): GeneratedMeal {
  const calories = ingredients.reduce((total, ingredient) => total + ingredient.calories, 0)
  const ratio = meal.calories > 0 ? calories / meal.calories : 1
  return {
    ...meal,
    ingredients,
    calories,
    protein: Math.max(0, Math.round(meal.protein * ratio)),
    carbs: Math.max(0, Math.round(meal.carbs * ratio)),
    fat: Math.max(0, Math.round(meal.fat * ratio)),
  }
}

function DetailedMeal({ meal, profile, preferences, onChange }: { meal: GeneratedMeal; profile: Profile; preferences: PlanPreferences; onChange: (meal: GeneratedMeal) => Promise<void> }) {
  const [customizing, setCustomizing] = useState(false)
  const [addDescription, setAddDescription] = useState('')
  const [busy, setBusy] = useState<'add' | 'swaps' | 'apply' | ''>('')
  const [localError, setLocalError] = useState('')

  async function removeIngredient(index: number) {
    if (meal.ingredients.length <= 1) return
    setLocalError('')
    try { await onChange(rebuildMeal(meal, meal.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index))) }
    catch (reason) { setLocalError(reason instanceof Error ? reason.message : 'Não foi possível salvar a alteração.') }
  }

  async function addIngredient() {
    const description = addDescription.trim()
    if (!description) return
    setBusy('add')
    setLocalError('')
    try {
      const estimate = await estimateFoodWithOpenAI(description)
      const additions: PlanIngredient[] = estimate.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        householdMeasure: `${formatQuantity(item.quantity)} ${formatUnit(item.unit, item.quantity)}`,
        calories: item.calories,
      }))
      await onChange(rebuildMeal(meal, [...meal.ingredients, ...additions]))
      setAddDescription('')
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o alimento.')
    } finally { setBusy('') }
  }

  async function loadSwaps() {
    if (meal.swapSuggestions?.length) return
    setBusy('swaps')
    setLocalError('')
    try {
      const swapSuggestions = await suggestMealSwaps(meal, profile, preferences)
      await onChange({ ...meal, swapSuggestions })
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Não foi possível criar sugestões de troca.')
    } finally { setBusy('') }
  }

  async function applySwap(suggestion: MealSwapSuggestion) {
    setBusy('apply')
    setLocalError('')
    try {
      await onChange({ ...meal, ...suggestion, label: meal.label, time: meal.time, swapSuggestions: meal.swapSuggestions })
      setCustomizing(false)
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a troca.')
    } finally { setBusy('') }
  }

  return <article className="generated-meal-card">
    <div className="generated-meal-head">
      <span className="plan-emoji">{mealIcons[meal.label] || '🍽️'}</span>
      <div><span className="meal-plan-time"><Clock3 size={12} /> {meal.time}</span><strong>{meal.label}</strong><h3>{meal.title}</h3></div>
      <div className="meal-head-actions"><b>{meal.calories} <small>kcal</small></b><button type="button" onClick={() => setCustomizing(value => !value)}><Pencil size={13} /> Personalizar</button></div>
    </div>
    <div className="generated-meal-body">
      <ul className="ingredient-list">{meal.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}><span><strong>{formatQuantity(ingredient.quantity)} {formatUnit(ingredient.unit, ingredient.quantity)}</strong> de {ingredient.name}<small>{ingredient.householdMeasure}</small></span><div><b>{ingredient.calories} kcal</b>{customizing && <button type="button" className="remove-ingredient" disabled={meal.ingredients.length <= 1 || Boolean(busy)} aria-label={`Excluir ${ingredient.name}`} title="Excluir alimento" onClick={() => removeIngredient(index)}><Trash2 size={13} /></button>}</div></li>)}</ul>
      <div className="meal-preparation"><ChefHat size={15} /><span><strong>Como preparar</strong>{meal.preparation}</span></div>
    </div>
    {customizing && <div className="meal-customizer">
      <div className="customizer-heading"><div><strong>Personalize esta refeição</strong><span>Exclua itens, adicione alimentos ou substitua a refeição inteira.</span></div><button type="button" aria-label="Fechar personalização" onClick={() => setCustomizing(false)}><X size={16} /></button></div>
      <div className="add-ingredient-form"><input value={addDescription} disabled={Boolean(busy)} placeholder="Ex.: 100g de banana ou 1 copo de iogurte" onChange={event => setAddDescription(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addIngredient() }} /><button type="button" disabled={!addDescription.trim() || Boolean(busy)} onClick={addIngredient}>{busy === 'add' ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Adicionar</button></div>
      <div className="swap-action"><button type="button" disabled={Boolean(busy)} onClick={loadSwaps}>{busy === 'swaps' ? <LoaderCircle className="spin" size={15} /> : <Repeat2 size={15} />} {meal.swapSuggestions?.length ? 'Sugestões de troca' : 'Gerar sugestões de troca'}</button><span>As alternativas mantêm as calorias desta refeição em uma faixa de ±5%.</span></div>
      {meal.swapSuggestions && meal.swapSuggestions.length > 0 && <div className="swap-grid">{meal.swapSuggestions.map((suggestion, index) => <div className="swap-card" key={`${suggestion.title}-${index}`}><div><strong>{suggestion.title}</strong><b>{suggestion.calories} kcal</b></div><p>{suggestion.ingredients.map(ingredient => `${formatQuantity(ingredient.quantity)} ${formatUnit(ingredient.unit, ingredient.quantity)} de ${ingredient.name}`).join(' · ')}</p><span>{suggestion.protein}g proteína · {suggestion.carbs}g carbo · {suggestion.fat}g gorduras</span><button type="button" disabled={Boolean(busy)} onClick={() => applySwap(suggestion)}>{busy === 'apply' ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Usar esta opção</button></div>)}</div>}
      {localError && <div className="customizer-error"><AlertCircle size={14} /> {localError}</div>}
    </div>}
    <div className="meal-macros"><span><b>{meal.protein}g</b> proteína</span><span><b>{meal.carbs}g</b> carboidratos</span><span><b>{meal.fat}g</b> gorduras</span></div>
  </article>
}

function requiresRenalReview(preferences: PlanPreferences) {
  if ((preferences.healthConditions || []).includes('kidney_disease')) return true
  const notes = (preferences.healthNotes || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /\b(renal|rim|rins|nefro|hemodialise|dialise)\b/.test(notes)
}

function ClinicalSafetyPlan({ profile, onReset }: Pick<Props, 'profile' | 'onReset'>) {
  return <>
    <header className="page-header plan-page-header"><div><span className="date-label"><ShieldCheck size={15} /> Segurança clínica</span><h1>Plano nutricional especializado</h1><p>{profile.name.split(' ')[0]}, sua condição exige parâmetros clínicos que um gerador alimentar genérico não consegue validar.</p></div><button className="button secondary" onClick={onReset}><Pencil size={16} /> Revisar respostas</button></header>
    <section className="clinical-safety-card card">
      <span className="clinical-safety-icon"><HeartPulse size={28} /></span>
      <div><span className="card-kicker">Geração automática pausada</span><h2>Não vamos criar uma dieta renal sem dados clínicos.</h2><p>Na doença renal crônica, restringir potássio, proteína, fósforo, sódio ou líquidos depende do estágio, dos exames e do tipo de tratamento. Uma recomendação genérica pode ser inadequada nos dois sentidos.</p></div>
    </section>
    <section className="clinical-requirements card"><div><Info size={18} /><div><strong>O plano deve ser definido com nutricionista e nefrologista considerando:</strong><ul><li>estágio da doença e taxa de filtração glomerular;</li><li>potássio sérico e orientação individual sobre alimentos ricos em potássio;</li><li>tratamento conservador, hemodiálise ou diálise peritoneal;</li><li>metas de proteína, sódio, fósforo e líquidos.</li></ul></div></div><button className="button primary" onClick={onReset}>Atualizar informações do plano</button></section>
    <div className="health-disclaimer"><AlertCircle size={19} /><p><strong>Por segurança, nenhum plano anterior será exibido nem alterado pela IA enquanto a condição renal estiver selecionada.</strong> O diário alimentar continua disponível como registro, sem substituir orientação clínica.</p></div>
  </>
}

function PersonalizedPlan({ profile, nutrition, preferences, onReset }: Omit<Props, 'preferences' | 'onComplete'> & { preferences: PlanPreferences }) {
  const [response, setResponse] = useState<GeneratedPlanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    let active = true
    generateNutritionPlan(profile, nutrition, preferences)
      .then(result => { if (active) { setResponse(result); setError('') } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível gerar seu plano.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profile, nutrition, preferences])

  async function regenerate() {
    if (response?.plan.isCustomized && !window.confirm('Gerar outra versão substituirá suas personalizações atuais. Deseja continuar?')) return
    setLoading(true)
    setError('')
    setSaveStatus('idle')
    try { setResponse(await generateNutritionPlan(profile, nutrition, preferences, true)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar seu plano.') }
    finally { setLoading(false) }
  }

  async function updateMeal(nextMeal: GeneratedMeal) {
    if (!response) return
    const meals = response.plan.meals.map(meal => meal.label === nextMeal.label && meal.time === nextMeal.time ? nextMeal : meal)
    const nextPlan = {
      ...response.plan,
      meals,
      dailyCalories: meals.reduce((total, meal) => total + meal.calories, 0),
      protein: meals.reduce((total, meal) => total + meal.protein, 0),
      carbs: meals.reduce((total, meal) => total + meal.carbs, 0),
      fat: meals.reduce((total, meal) => total + meal.fat, 0),
      isCustomized: true,
    }
    setResponse({ ...response, plan: nextPlan, cached: true })
    setSaveStatus('saving')
    try {
      await saveCustomizedNutritionPlan(nextPlan)
      setSaveStatus('saved')
    } catch (reason) {
      setSaveStatus('error')
      throw reason
    }
  }

  const plan = response?.plan
  const calorieTarget = nutrition.restTarget
  const currentCalories = plan?.dailyCalories ?? calorieTarget
  const minimumCalories = Math.ceil(calorieTarget * .95)
  const calorieDifference = currentCalories - calorieTarget
  const caloriePercentage = calorieTarget > 0 ? Math.round((currentCalories / calorieTarget) * 1000) / 10 : 100
  const calorieStatus = currentCalories > calorieTarget ? 'over' : currentCalories < minimumCalories ? 'under' : 'within'
  return <>
    <header className="page-header plan-page-header"><div><span className="date-label"><Sparkles size={15} /> Plano individualizado por IA</span><h1>Seu plano alimentar</h1><p>Pratos, quantidades e preparo criados para {goalLabels[profile.goal].toLowerCase()} dentro da sua rotina.</p></div><div className="plan-header-actions"><button className="button secondary" disabled={loading} onClick={regenerate}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Gerar outra versão</button><button className="button secondary" onClick={onReset}><Pencil size={16} /> Revisar respostas</button></div></header>
    {preferences.hasHealthCondition && <div className="professional-alert"><AlertCircle size={19} /><div><strong>Seu plano precisa de revisão profissional</strong><span>Como você informou uma condição de saúde ou medicação, use esta sugestão somente como referência até conversar com nutricionista ou médico.</span></div></div>}
    <section className="plan-hero card"><div><span className="card-kicker"><Sparkles size={16} /> {response ? response.cached ? 'Plano salvo' : 'Plano gerado por IA' : 'Meta base personalizada'}</span><h2>{(plan?.dailyCalories || nutrition.restTarget).toLocaleString('pt-BR')} <small>kcal / dia</small></h2><p>{plan?.summary || <>Nos dias de treino, sua meta passa para <strong>{nutrition.activeTarget.toLocaleString('pt-BR')} kcal</strong>.</>}</p><span className="calorie-band-note">Faixa do plano-base: {Math.ceil(nutrition.restTarget * .95).toLocaleString('pt-BR')}–{nutrition.restTarget.toLocaleString('pt-BR')} kcal.</span></div><div className="macro-summary"><div><strong>{plan?.protein ?? nutrition.protein}g</strong><span>proteínas</span></div><div><strong>{plan?.carbs ?? nutrition.carbs}g</strong><span>carboidratos</span></div><div><strong>{plan?.fat ?? nutrition.fat}g</strong><span>gorduras</span></div></div></section>
    {plan && <section className={`calorie-comparison card ${calorieStatus}`}>
      <div className="calorie-comparison-heading"><div><span><Target size={17} /></span><div><strong>Controle calórico do plano</strong><small>Acompanhe este total ao personalizar suas refeições.</small></div></div><b>{calorieStatus === 'within' ? 'Dentro da faixa' : calorieStatus === 'over' ? 'Acima da meta' : 'Abaixo da faixa'}</b></div>
      <div className="calorie-comparison-values"><div><small>Meta do plano (sem treino)</small><strong>{calorieTarget.toLocaleString('pt-BR')} <span>kcal</span></strong></div><div><small>Total atual</small><strong>{currentCalories.toLocaleString('pt-BR')} <span>kcal</span></strong></div><div><small>Diferença</small><strong>{calorieDifference === 0 ? 'Meta atingida' : `${Math.abs(calorieDifference).toLocaleString('pt-BR')} kcal ${calorieDifference > 0 ? 'acima' : 'abaixo'}`}</strong></div></div>
      <div className="calorie-comparison-meter"><div className="calorie-meter-track"><i style={{ width: `${Math.min(100, caloriePercentage)}%` }} /><span style={{ left: '95%' }} /></div><div><span>Mínimo recomendado: {minimumCalories.toLocaleString('pt-BR')} kcal</span><strong>{caloriePercentage.toLocaleString('pt-BR')}% da meta</strong></div></div>
    </section>}
    <section className="plan-profile-strip"><div><Leaf size={17} /><span><small>Estilo</small><strong>{styleLabels[preferences.dietaryStyle]}</strong></span></div><div><UtensilsCrossed size={17} /><span><small>Rotina</small><strong>{preferences.mealsPerDay} refeições</strong></span></div><div><ChefHat size={17} /><span><small>Preparo</small><strong>{preferences.cookingTime === 'quick' ? 'Até 15 min' : preferences.cookingTime === 'moderate' ? 'Até 30 min' : 'Flexível'}</strong></span></div><div><Coins size={17} /><span><small>Orçamento</small><strong>{budgetLabels[preferences.budget]}</strong></span></div></section>
    <section className="meal-plan"><div className="section-heading"><div><span className="section-icon"><Salad size={19} /></span><div><h2>Seu dia alimentar</h2><p>Quantidades referem-se aos alimentos prontos ou cozidos, salvo quando indicado.</p></div></div><div className="plan-state-badges">{saveStatus !== 'idle' && <span className={`plan-save-status ${saveStatus}`}>{saveStatus === 'saving' && <LoaderCircle className="spin" size={12} />}{saveStatus === 'saved' && <Check size={12} />}{saveStatus === 'error' && <AlertCircle size={12} />}{saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'saved' ? 'Personalização salva' : 'Erro ao salvar'}</span>}{response && <span className="ai-plan-badge"><Sparkles size={13} /> IA · {response.cached ? 'salvo' : 'novo'}</span>}</div></div>{loading && !plan ? <div className="plan-generation-state"><LoaderCircle className="spin" size={25} /><strong>Criando combinações que fazem sentido…</strong><span>Calculando porções, calorias e macronutrientes de cada refeição.</span></div> : error && !plan ? <div className="plan-generation-state error"><AlertCircle size={25} /><strong>Não conseguimos montar o plano</strong><span>{error}</span><button className="button secondary" onClick={regenerate}>Tentar novamente</button></div> : plan && <div className={`generated-plan-list ${loading ? 'updating' : ''}`}>{plan.meals.map(meal => <DetailedMeal key={`${meal.label}-${meal.time}`} meal={meal} profile={profile} preferences={preferences} onChange={updateMeal} />)}</div>}{error && plan && <div className="inline-plan-error"><AlertCircle size={15} /> {error}</div>}</section>
    {plan && <section className="daily-guidance card"><div><Info size={18} /><strong>Orientações para o dia</strong></div><ul>{plan.dailyGuidance.map(item => <li key={item}>{item}</li>)}</ul></section>}
    <section className="plan-details-grid"><div><span><Activity size={18} /></span><div><small>Hidratação sugerida</small><strong>{nutrition.water} litros por dia</strong><p>Aumente conforme calor, suor e orientação profissional.</p></div></div><div><span><Target size={18} /></span><div><small>Preferências registradas</small><strong>{preferences.favoriteFoods || 'Nenhuma preferência específica'}</strong><p>{preferences.dislikedFoods ? `Evitar quando possível: ${preferences.dislikedFoods}` : 'Nenhum alimento adicional para evitar.'}</p></div></div></section>
    {preferences.restrictions.length > 0 && <div className="restriction-summary"><ShieldCheck size={17} /><strong>O plano considera:</strong>{preferences.restrictions.map(item => <span key={item}>Sem {item.toLowerCase()}</span>)}</div>}
    <div className="health-disclaimer"><Info size={19} /><p><strong>Este plano gerado por IA é uma estimativa educativa.</strong> As porções são um ponto de partida e não substituem avaliação individual de nutricionista ou médico, especialmente em alergias, gestação, doenças ou uso de medicação.</p></div>
  </>
}

export function PlanExperience(props: Props) {
  if (props.billingEnabled && !isSubscriptionActive(props.subscription)) {
    return <PricingScreen subscription={props.subscription} onSubscriptionChange={props.onSubscriptionChange} />
  }

  const entitledMode = props.billingEnabled && props.subscription ? props.subscription.planMode : null
  const preferences = props.preferences ? { ...props.preferences, planMode: entitledMode || props.preferences.planMode || 'guided' } : null
  let content
  if (!preferences) content = <PlanOnboarding profile={props.profile} onComplete={props.onComplete} forcedMode={entitledMode || undefined} />
  else if (preferences.planMode === 'self') content = <SelfPlanner profile={props.profile} nutrition={props.nutrition} preferences={preferences} onReset={props.onReset} />
  else if (requiresRenalReview(preferences)) content = <ClinicalSafetyPlan profile={props.profile} onReset={props.onReset} />
  else content = <PersonalizedPlan {...props} preferences={preferences} />

  return <>{props.billingEnabled && props.subscription && <SubscriptionBar subscription={props.subscription} />}{content}</>
}
