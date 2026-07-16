import { useMemo, useState } from 'react'
import { Check, Clock3, Database, Info, LoaderCircle, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { estimateFood, mealTypeForHour } from '../lib/nutrition'
import { estimateFoodWithOpenAI } from '../lib/openai'
import type { MealEntry } from '../types'

interface Props { onClose: () => void; onAdd: (entry: MealEntry) => void }

const nowTime = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function AddMealModal({ onClose, onAdd }: Props) {
  const [description, setDescription] = useState('')
  const [time, setTime] = useState(nowTime())
  const [aiEstimate, setAiEstimate] = useState<Awaited<ReturnType<typeof estimateFoodWithOpenAI>> | null>(null)
  const [aiError, setAiError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const localBreakdown = useMemo(() => estimateFood(description), [description])
  const breakdown = aiEstimate?.items || localBreakdown
  const estimated = aiEstimate?.totalCalories ?? breakdown.reduce((sum, item) => sum + item.calories, 0)
  const [manualCalories, setManualCalories] = useState<number | ''>('')
  const calories = manualCalories === '' ? estimated : Number(manualCalories)
  const canSave = description.trim().length > 2 && calories > 0

  function save() {
    if (!canSave) return
    const macroScale = estimated > 0 ? calories / estimated : 1
    const savedBreakdown = breakdown.map(item => ({
      ...item,
      protein: item.protein === undefined ? undefined : Math.round(item.protein * macroScale * 10) / 10,
      carbs: item.carbs === undefined ? undefined : Math.round(item.carbs * macroScale * 10) / 10,
      fat: item.fat === undefined ? undefined : Math.round(item.fat * macroScale * 10) / 10,
    }))
    onAdd({ id: crypto.randomUUID(), time, description: description.trim(), calories, mealType: mealTypeForHour(time), breakdown: savedBreakdown })
  }

  async function analyzeWithAi() {
    if (description.trim().length < 3 || isAnalyzing) return
    setIsAnalyzing(true)
    setAiError('')
    try {
      const result = await estimateFoodWithOpenAI(description.trim())
      setAiEstimate(result)
      setManualCalories('')
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Não foi possível analisar a refeição.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="meal-title">
        <header className="modal-header"><div><span className="modal-icon"><Plus size={21} /></span><div><small>Novo registro</small><h2 id="meal-title">O que você comeu?</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>
        <div className="modal-body">
          <label className="field">
            <span>Descreva sua refeição</span>
            <textarea autoFocus rows={4} placeholder="Ex.: comi 3 uvas encapadas e tomei um café sem açúcar" value={description} onChange={event => { setDescription(event.target.value); setManualCalories(''); setAiEstimate(null); setAiError('') }} />
            <div className="meal-assist-row"><small className="field-hint"><Sparkles size={13} /> Inclua quantidades sempre que puder.</small><button type="button" className="ai-estimate-button" disabled={description.trim().length < 3 || isAnalyzing} onClick={analyzeWithAi}>{isAnalyzing ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{isAnalyzing ? 'Calculando...' : 'Calcular refeição'}</button></div>
          </label>
          <label className="field time-field"><span>Horário</span><div className="input-with-icon"><Clock3 size={18} /><input type="time" value={time} onChange={event => setTime(event.target.value)} /></div></label>

          {aiError && <div className="ai-error"><Info size={16} /><span>{aiError} Você ainda pode informar as calorias manualmente.</span></div>}
          {description.length > 2 && estimated === 0 && !isAnalyzing && (
            <div className="estimate-empty"><Info size={20} /><div><strong>Não reconhecemos esse alimento ainda</strong><span>Informe abaixo as calorias aproximadas da porção.</span></div></div>
          )}
          {breakdown.length > 0 && (
            <div className="estimate-card">
              <div className="estimate-title"><span>{aiEstimate?.cached ? <Database size={16} /> : aiEstimate ? <WandSparkles size={16} /> : <Sparkles size={16} />} {aiEstimate?.cache.strategy === 'taco' ? 'Estimativa pela TACO' : aiEstimate?.cached ? 'Estimativa recuperada' : aiEstimate ? 'Estimativa com OpenAI' : 'Estimativa instantânea'}{aiEstimate?.cached && <small className="cache-badge">sem gastar tokens</small>}</span><strong>{estimated} kcal</strong></div>
              {breakdown.map(item => <div className="estimate-row" key={item.name}><span><Check size={14} /> {item.quantity} {item.unit} · {item.name}</span><b>{item.calories} kcal</b></div>)}
              {aiEstimate?.note && <div className="ai-note"><Info size={13} /> {aiEstimate.note}</div>}
              {aiEstimate?.cached && <div className="cache-note"><Database size={13} /> {aiEstimate.cache.strategy === 'taco' ? 'Calculamos pela quantidade usando a tabela brasileira TACO/Unicamp.' : aiEstimate.cache.strategy === 'items' ? 'Montamos esta estimativa com alimentos já salvos no banco.' : 'Esta busca já havia sido analisada. Reutilizamos o resultado salvo no banco.'}</div>}
            </div>
          )}
          <label className="field calorie-override"><span>Calorias {estimated > 0 ? <small>(você pode corrigir)</small> : ''}</span><div className="input-with-suffix"><input type="number" min="1" placeholder={estimated ? String(estimated) : 'Ex.: 230'} value={manualCalories} onChange={event => setManualCalories(event.target.value === '' ? '' : Number(event.target.value))} /><b>kcal</b></div></label>
          <div className="modal-note"><Info size={15} /> A estimativa pode variar conforme receita, marca e tamanho da porção.</div>
        </div>
        <footer className="modal-actions"><button className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!canSave} onClick={save}>Adicionar ao diário <Plus size={18} /></button></footer>
      </section>
    </div>
  )
}
