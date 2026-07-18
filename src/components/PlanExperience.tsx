import { useEffect, useState } from 'react'
import { Activity, AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Calculator, Check, ChefHat, Clock3, Coins, CreditCard, Crown, HeartPulse, Info, Leaf, LoaderCircle, LockKeyhole, Salad, ShieldCheck, Sparkles, Target, UtensilsCrossed, WalletCards } from 'lucide-react'
import { isSubscriptionActive, loadCurrentSubscription, openBillingPortal, startSubscriptionCheckout } from '../lib/billing'
import { generateNutritionPlan } from '../lib/plan-ai'
import type { DietaryStyle, FoodBudget, GeneratedMeal, GeneratedPlanResponse, HealthCondition, NutritionPlan, PlanMode, PlanPreferences, Profile, Subscription } from '../types'
import { SelfPlanner } from './SelfPlanner'

interface Props {
  profile: Profile
  nutrition: NutritionPlan
  preferences: PlanPreferences | null
  subscription: Subscription | null
  betaPlan: PlanMode | null
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
      <button type="button" className="plan-mode-card" onClick={() => chooseMode('guided')}><span className="plan-mode-icon premium"><Crown size={25} /></span><span className="plan-mode-badge premium">Plano acompanhado</span><h2>Plano personalizado</h2><p>Receba refeições e porções individualizadas, revisadas antes da liberação por um nutricionista.</p><ul><li><Check size={14} /> Plano alimentar estruturado</li><li><ShieldCheck size={14} /> Edição e validação por nutricionista</li><li><ChefHat size={14} /> Preparo após a aprovação</li></ul><strong>Continuar para personalização <ArrowRight size={16} /></strong></button>
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

        {step === 1 && <div className="plan-step"><span className="plan-step-icon"><ShieldCheck size={23} /></span><h2>Existe algo que você evita?</h2><p>{data.planMode === 'self' ? 'Essas marcações ficam visíveis como lembrete pessoal no planejador.' : 'Marque alergias ou restrições. Você pode deixar tudo desmarcado.'}</p><div className="restriction-grid">{restrictionOptions.map(item => <button type="button" key={item} className={data.restrictions.includes(item) ? 'selected' : ''} onClick={() => toggleRestriction(item)}><span>{data.restrictions.includes(item) && <Check size={13} />}</span>{item}</button>)}</div>{data.planMode === 'guided' && <><div className="health-question"><div><HeartPulse size={20} /><span><strong>Possui condição de saúde ou usa medicação contínua?</strong><small>Essas informações serão destacadas para o nutricionista responsável pela revisão.</small></span></div><div className="binary-choice"><button type="button" className={!data.hasHealthCondition ? 'selected' : ''} onClick={() => setData(previous => ({ ...previous, hasHealthCondition: false, healthConditions: [], healthNotes: '' }))}>Não</button><button type="button" className={data.hasHealthCondition ? 'selected' : ''} onClick={() => set('hasHealthCondition', true)}>Sim</button></div></div>{data.hasHealthCondition && <div className="health-condition-fields"><div><span className="field-label">Selecione a condição informada</span><div className="health-condition-grid">{healthConditionOptions.map(condition => <button type="button" key={condition.id} className={data.healthConditions.includes(condition.id) ? 'selected' : ''} onClick={() => toggleHealthCondition(condition.id)}><span>{data.healthConditions.includes(condition.id) && <Check size={12} />}</span>{condition.label}</button>)}</div></div>{data.healthConditions.includes('kidney_disease') && <div className="renal-safety-note"><AlertCircle size={17} /><div><strong>Revisão clínica obrigatória</strong><span>Informe nas observações estágio da doença, tratamento, orientação sobre potássio, proteína e líquidos, quando souber. Nenhuma dieta será liberada sem validação profissional.</span></div></div>}<label className="field"><span>Observações para o nutricionista</span><textarea rows={2} placeholder="Ex.: medicação, estágio da condição e orientações já recebidas. Não inclua nome, e-mail ou documentos." value={data.healthNotes} onChange={event => set('healthNotes', event.target.value)} /></label></div>}</>}</div>}

        {step === 2 && <div className="plan-step"><span className="plan-step-icon"><ChefHat size={23} /></span><h2>Qual plano cabe na sua rotina?</h2><p>A melhor estratégia é aquela que você consegue repetir.</p><div className="plan-form-row"><div className="plan-control"><span><UtensilsCrossed size={16} /> Refeições por dia</span><div className="number-choice">{([3, 4, 5, 6] as const).map(number => <button key={number} className={data.mealsPerDay === number ? 'selected' : ''} onClick={() => set('mealsPerDay', number)}>{number}</button>)}</div></div><div className="plan-control"><span><Clock3 size={16} /> Tempo para cozinhar</span><div className="stack-choice"><button className={data.cookingTime === 'quick' ? 'selected' : ''} onClick={() => set('cookingTime', 'quick')}><b>Até 15 min</b><small>Praticidade acima de tudo</small></button><button className={data.cookingTime === 'moderate' ? 'selected' : ''} onClick={() => set('cookingTime', 'moderate')}><b>Até 30 min</b><small>Um pouco de preparo</small></button><button className={data.cookingTime === 'flexible' ? 'selected' : ''} onClick={() => set('cookingTime', 'flexible')}><b>Sem limite</b><small>Gosto de cozinhar</small></button></div></div></div><div className="budget-control"><span><Coins size={16} /> Orçamento para alimentação</span><div>{(['economy', 'balanced', 'flexible'] as const).map(item => <button key={item} className={data.budget === item ? 'selected' : ''} onClick={() => set('budget', item)}><WalletCards size={16} />{budgetLabels[item]}</button>)}</div></div></div>}

        {step === 3 && <div className="plan-step"><span className="plan-step-icon"><Clock3 size={23} /></span><h2>Últimos detalhes da sua rotina</h2><p>Use horários aproximados. O plano continua flexível.</p><div className="time-grid"><label className="field"><span>Café da manhã</span><input type="time" value={data.breakfastTime} onChange={event => set('breakfastTime', event.target.value)} /></label><label className="field"><span>Almoço</span><input type="time" value={data.lunchTime} onChange={event => set('lunchTime', event.target.value)} /></label><label className="field"><span>Jantar</span><input type="time" value={data.dinnerTime} onChange={event => set('dinnerTime', event.target.value)} /></label></div><div className="preference-grid"><label className="field"><span>Alimentos que você gosta</span><textarea rows={3} placeholder="Ex.: arroz, feijão, banana, frango..." value={data.favoriteFoods} onChange={event => set('favoriteFoods', event.target.value)} /></label><label className="field"><span>Alimentos que prefere evitar</span><textarea rows={3} placeholder="Ex.: brócolis, peixe, abacate..." value={data.dislikedFoods} onChange={event => set('dislikedFoods', event.target.value)} /></label></div><div className="plan-ready-note">{data.planMode === 'self' ? <Calculator size={18} /> : <Sparkles size={18} />}<div><strong>{data.planMode === 'self' ? 'Sua estrutura está pronta' : 'Tudo pronto para personalizar'}</strong><span>{data.planMode === 'self' ? 'Agora você poderá preencher e editar cada refeição por conta própria.' : 'Vamos combinar seu objetivo, gasto energético, rotina e preferências.'}</span></div></div></div>}
      </div>

      <div className="plan-onboarding-actions"><button className="button ghost" disabled={step === 0 && Boolean(forcedMode)} onClick={() => step === 0 ? setModeChosen(false) : setStep(value => value - 1)}><ArrowLeft size={17} /> Voltar</button>{step < 3 ? <button className="button primary" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Continuar <ArrowRight size={17} /></button> : <button className="button primary" onClick={finish}>{data.planMode === 'self' ? <>Abrir meu planejador <Calculator size={17} /></> : <>Construir meu plano <Sparkles size={17} /></>}</button>}</div>
    </section>
  )
}

export function PricingScreen({ subscription, onSubscriptionChange }: Pick<Props, 'subscription' | 'onSubscriptionChange'>) {
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

  const basicPrice = import.meta.env.VITE_BASIC_PLAN_PRICE_LABEL || 'R$ 18,90/mês'
  const guidedPrice = import.meta.env.VITE_GUIDED_PLAN_PRICE_LABEL || 'R$ 27,90/mês'
  return <section className="billing-page">
    <div className="billing-intro"><span className="date-label"><CreditCard size={15} /> Assinatura VivaMeta</span><h1>Escolha como deseja planejar sua alimentação</h1><p>Pagamento recorrente por cartão processado pelo Stripe. O VivaMeta não recebe nem armazena os dados do seu cartão.</p></div>
    {checking && <div className="billing-status checking"><LoaderCircle className="spin" size={18} /><div><strong>Confirmando seu pagamento…</strong><span>Isso normalmente leva apenas alguns segundos.</span></div></div>}
    {checkoutState === 'cancelled' && <div className="billing-status"><Info size={18} /><div><strong>Pagamento cancelado</strong><span>Nenhuma cobrança foi concluída. Você pode tentar novamente quando quiser.</span></div></div>}
    {subscription && !isSubscriptionActive(subscription) && <div className="billing-status warning"><AlertCircle size={18} /><div><strong>Assinatura {subscription.status === 'past_due' ? 'com pagamento pendente' : 'inativa'}</strong><span>Regularize o pagamento no portal ou inicie uma nova assinatura.</span></div>{subscription.status !== 'incomplete' && <button className="button secondary" disabled={busy === 'portal'} onClick={manage}>{busy === 'portal' ? <LoaderCircle className="spin" size={15} /> : <CreditCard size={15} />} Gerenciar</button>}</div>}
    <div className="pricing-grid">
      <article className="pricing-card"><span className="pricing-icon"><Calculator size={24} /></span><span className="pricing-kicker">Plano básico</span><h2>Diário e metas</h2><strong className="pricing-price">{basicPrice}</strong><p>Registre suas refeições e acompanhe diariamente o consumo em relação à sua meta calórica.</p><ul><li><Check size={15} /> Registro de refeições no diário</li><li><Check size={15} /> Cálculo da meta de calorias diárias</li><li><Check size={15} /> Acompanhamento de calorias e macros</li></ul><button className="button secondary" disabled={Boolean(busy) || checking} onClick={() => subscribe('self')}>{busy === 'self' ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} Assinar plano básico</button></article>
      <article className="pricing-card featured"><span className="pricing-recommended">Mais completo</span><span className="pricing-icon premium"><Crown size={24} /></span><span className="pricing-kicker">Plano Plus</span><h2>Dieta personalizada</h2><strong className="pricing-price">{guidedPrice}</strong><p>Receba uma dieta individualizada, com porções e preparo, validada por especialista em nutrição.</p><ul><li><Check size={15} /> Tudo que está incluído no Plano Básico</li><li><Sparkles size={15} /> Dieta com porções, preparo e substituições</li><li><ShieldCheck size={15} /> Validação por especialista em nutrição</li></ul><button className="button primary" disabled={Boolean(busy) || checking} onClick={() => subscribe('guided')}>{busy === 'guided' ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} Assinar Plano Plus</button></article>
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
  return <div className="subscription-bar"><span><BadgeCheck size={17} /><div><strong>{subscription.planMode === 'self' ? 'Plano básico ativo' : 'Plano Plus ativo'}</strong><small>{subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? `Acesso até ${new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}` : 'Assinatura ativa'}</small></div></span><button className="button secondary" disabled={busy} onClick={manage}>{busy ? <LoaderCircle className="spin" size={14} /> : <CreditCard size={14} />} Gerenciar assinatura</button>{error && <em>{error}</em>}</div>
}

function BetaAccessBar({ planMode }: { planMode: PlanMode }) {
  return <div className="subscription-bar beta-access"><span><BadgeCheck size={17} /><div><strong>Acesso beta · {planMode === 'guided' ? 'Plano Plus' : 'Plano básico'}</strong><small>Conta liberada sem cobrança durante o programa beta.</small></div></span></div>
}

const mealIcons: Record<string, string> = { 'Café da manhã': '☀️', 'Lanche da manhã': '🍎', 'Almoço': '🥗', 'Lanche da tarde': '🥜', 'Jantar': '🍲', 'Ceia': '🌙' }
const formatQuantity = (quantity: number) => quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const formatUnit = (unit: string, quantity: number) => {
  if (quantity === 1 || ['g', 'ml'].includes(unit)) return unit
  const plurals: Record<string, string> = { unidade: 'unidades', fatia: 'fatias', 'colher de sopa': 'colheres de sopa', 'colher de chá': 'colheres de chá', xícara: 'xícaras', pote: 'potes' }
  return plurals[unit] || unit
}

function DetailedMeal({ meal, approved }: { meal: GeneratedMeal; approved: boolean }) {
  return <article className="generated-meal-card">
    <div className="generated-meal-head">
      <span className="plan-emoji">{mealIcons[meal.label] || '🍽️'}</span>
      <div><span className="meal-plan-time"><Clock3 size={12} /> {meal.time}</span><strong>{meal.label}</strong><h3>{meal.title}</h3></div>
      <div className="meal-head-actions"><b>{meal.calories} <small>kcal</small></b></div>
    </div>
    <div className="generated-meal-body">
      <ul className="ingredient-list">{meal.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}><span><strong>{formatQuantity(ingredient.quantity)} {formatUnit(ingredient.unit, ingredient.quantity)}</strong> de {ingredient.name}<small>{ingredient.householdMeasure}</small></span><div><b>{ingredient.calories} kcal</b></div></li>)}</ul>
      {approved && meal.preparation ? <div className="meal-preparation"><ChefHat size={15} /><span><strong>Como preparar</strong>{meal.preparation}</span></div> : <div className="meal-preparation pending"><Clock3 size={15} /><span><strong>Preparo aguardando aprovação</strong>O modo de preparo será gerado somente após a validação do nutricionista.</span></div>}
    </div>
    <div className="meal-macros"><span><b>{meal.protein}g</b> proteína</span><span><b>{meal.carbs}g</b> carboidratos</span><span><b>{meal.fat}g</b> gorduras</span></div>
  </article>
}

function PersonalizedPlan({ profile, nutrition, preferences }: Omit<Props, 'preferences' | 'onComplete'> & { preferences: PlanPreferences }) {
  const [response, setResponse] = useState<GeneratedPlanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    generateNutritionPlan(profile, nutrition, preferences)
      .then(result => { if (active) { setResponse(result); setError('') } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível gerar seu plano.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profile, nutrition, preferences])

  useEffect(() => {
    if (!response || response.reviewStatus === 'approved') return
    const interval = window.setInterval(() => {
      generateNutritionPlan(profile, nutrition, preferences)
        .then(result => { setResponse(result); setError('') })
        .catch(() => { /* Mantém o rascunho visível enquanto a consulta é repetida. */ })
    }, 15000)
    return () => window.clearInterval(interval)
  }, [profile, nutrition, preferences, response])

  async function retry() {
    setLoading(true)
    setError('')
    try { setResponse(await generateNutritionPlan(profile, nutrition, preferences)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar seu plano.') }
    finally { setLoading(false) }
  }

  const plan = response?.plan
  const approved = response?.reviewStatus === 'approved'
  const calorieTarget = nutrition.dailyTarget
  const currentCalories = plan?.dailyCalories ?? calorieTarget
  const minimumCalories = Math.ceil(calorieTarget * .95)
  const calorieDifference = currentCalories - calorieTarget
  const caloriePercentage = calorieTarget > 0 ? Math.round((currentCalories / calorieTarget) * 1000) / 10 : 100
  const calorieStatus = currentCalories > calorieTarget ? 'over' : currentCalories < minimumCalories ? 'under' : 'within'
  return <>
    <header className="page-header plan-page-header"><div><span className="date-label"><ShieldCheck size={15} /> Plano Plus revisado</span><h1>Seu plano alimentar</h1><p>Os ingredientes são bloqueados para edição e passam pela validação de um nutricionista.</p></div></header>
    {response && !approved && <div className="professional-alert"><LoaderCircle className="spin" size={19} /><div><strong>{response.reviewStatus === 'in_review' ? 'Seu plano está em revisão' : 'Seu plano entrou na fila de aprovação'}</strong><span>O modo de preparo será incluído somente depois que o profissional confirmar todos os ingredientes e quantidades.</span></div></div>}
    {approved && <div className="professional-alert approved"><BadgeCheck size={19} /><div><strong>Dieta aprovada por nutricionista</strong><span>Os preparos foram gerados com base nos ingredientes confirmados pelo profissional.</span></div></div>}
    <section className="plan-hero card"><div><span className="card-kicker"><ShieldCheck size={16} /> {approved ? 'Plano profissionalmente aprovado' : 'Rascunho aguardando aprovação'}</span><h2>{(plan?.dailyCalories || nutrition.dailyTarget).toLocaleString('pt-BR')} <small>kcal / dia</small></h2><p>{plan?.summary || <>Meta estável nos sete dias, calculada com a média semanal dos treinos: <strong>{nutrition.dailyTarget.toLocaleString('pt-BR')} kcal por dia</strong>.</>}</p><span className="calorie-band-note">Uma nova dieta poderá ser solicitada no próximo ciclo da assinatura.</span></div><div className="macro-summary"><div><strong>{plan?.protein ?? nutrition.protein}g</strong><span>proteínas</span></div><div><strong>{plan?.carbs ?? nutrition.carbs}g</strong><span>carboidratos</span></div><div><strong>{plan?.fat ?? nutrition.fat}g</strong><span>gorduras</span></div></div></section>
    {plan && <section className={`calorie-comparison card ${calorieStatus}`}>
      <div className="calorie-comparison-heading"><div><span><Target size={17} /></span><div><strong>Controle calórico do plano</strong><small>Total calculado a partir das porções revisadas.</small></div></div><b>{calorieStatus === 'within' ? 'Dentro da faixa' : calorieStatus === 'over' ? 'Acima da meta' : 'Abaixo da faixa'}</b></div>
      <div className="calorie-comparison-values"><div><small>Meta diária média</small><strong>{calorieTarget.toLocaleString('pt-BR')} <span>kcal</span></strong></div><div><small>Total atual</small><strong>{currentCalories.toLocaleString('pt-BR')} <span>kcal</span></strong></div><div><small>Diferença</small><strong>{calorieDifference === 0 ? 'Meta atingida' : `${Math.abs(calorieDifference).toLocaleString('pt-BR')} kcal ${calorieDifference > 0 ? 'acima' : 'abaixo'}`}</strong></div></div>
      <div className="calorie-comparison-meter"><div className="calorie-meter-track"><i style={{ width: `${Math.min(100, caloriePercentage)}%` }} /><span style={{ left: '95%' }} /></div><div><span>Mínimo recomendado: {minimumCalories.toLocaleString('pt-BR')} kcal</span><strong>{caloriePercentage.toLocaleString('pt-BR')}% da meta</strong></div></div>
    </section>}
    <section className="plan-profile-strip"><div><Leaf size={17} /><span><small>Estilo</small><strong>{styleLabels[preferences.dietaryStyle]}</strong></span></div><div><UtensilsCrossed size={17} /><span><small>Rotina</small><strong>{preferences.mealsPerDay} refeições</strong></span></div><div><ChefHat size={17} /><span><small>Preparo</small><strong>{preferences.cookingTime === 'quick' ? 'Até 15 min' : preferences.cookingTime === 'moderate' ? 'Até 30 min' : 'Flexível'}</strong></span></div><div><Coins size={17} /><span><small>Orçamento</small><strong>{budgetLabels[preferences.budget]}</strong></span></div></section>
    <section className="meal-plan"><div className="section-heading"><div><span className="section-icon"><Salad size={19} /></span><div><h2>Seu dia alimentar</h2><p>Quantidades referem-se aos alimentos prontos ou cozidos, salvo quando indicado.</p></div></div>{response && <span className={`review-status ${response.reviewStatus || 'pending'}`}>{response.reviewStatus === 'approved' ? 'Aprovada' : response.reviewStatus === 'in_review' ? 'Em revisão' : 'Na fila'}</span>}</div>{loading && !plan ? <div className="plan-generation-state"><LoaderCircle className="spin" size={25} /><strong>Montando o rascunho para revisão…</strong><span>Calculando porções, calorias e macronutrientes antes do envio ao nutricionista.</span></div> : error && !plan ? <div className="plan-generation-state error"><AlertCircle size={25} /><strong>Não conseguimos solicitar o plano</strong><span>{error}</span><button className="button secondary" onClick={retry}>Tentar novamente</button></div> : plan && <div className={`generated-plan-list ${loading ? 'updating' : ''}`}>{plan.meals.map(meal => <DetailedMeal key={`${meal.label}-${meal.time}`} meal={meal} approved={approved} />)}</div>}{error && plan && <div className="inline-plan-error"><AlertCircle size={15} /> {error}</div>}</section>
    {plan && <section className="daily-guidance card"><div><Info size={18} /><strong>Orientações para o dia</strong></div><ul>{plan.dailyGuidance.map(item => <li key={item}>{item}</li>)}</ul></section>}
    <section className="plan-details-grid"><div><span><Activity size={18} /></span><div><small>Hidratação sugerida</small><strong>{nutrition.water} litros por dia</strong><p>Aumente conforme calor, suor e orientação profissional.</p></div></div><div><span><Target size={18} /></span><div><small>Preferências registradas</small><strong>{preferences.favoriteFoods || 'Nenhuma preferência específica'}</strong><p>{preferences.dislikedFoods ? `Evitar quando possível: ${preferences.dislikedFoods}` : 'Nenhum alimento adicional para evitar.'}</p></div></div></section>
    {preferences.restrictions.length > 0 && <div className="restriction-summary"><ShieldCheck size={17} /><strong>O plano considera:</strong>{preferences.restrictions.map(item => <span key={item}>Sem {item.toLowerCase()}</span>)}</div>}
    <div className="health-disclaimer"><Info size={19} /><p><strong>O plano é liberado somente após revisão nutricional.</strong> Ainda assim, ele não substitui consulta clínica, diagnóstico médico ou acompanhamento individual contínuo.</p></div>
  </>
}

export function PlanExperience(props: Props) {
  const paidPlan = isSubscriptionActive(props.subscription) ? props.subscription?.planMode || null : null
  const entitledMode = props.billingEnabled ? paidPlan || props.betaPlan : null

  if (props.billingEnabled && !entitledMode) {
    return <PricingScreen subscription={props.subscription} onSubscriptionChange={props.onSubscriptionChange} />
  }

  const preferences = props.preferences ? { ...props.preferences, planMode: entitledMode || props.preferences.planMode || 'guided' } : null
  let content
  if (!preferences) content = <PlanOnboarding profile={props.profile} onComplete={props.onComplete} forcedMode={entitledMode || undefined} />
  else if (preferences.planMode === 'self') content = <SelfPlanner profile={props.profile} nutrition={props.nutrition} preferences={preferences} onReset={props.onReset} />
  else content = <PersonalizedPlan {...props} preferences={preferences} />

  return <>{props.billingEnabled && paidPlan && props.subscription && <SubscriptionBar subscription={props.subscription} />}{props.billingEnabled && !paidPlan && props.betaPlan && <BetaAccessBar planMode={props.betaPlan} />}{content}</>
}
