import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Database, Info, LoaderCircle, Mic, MicOff, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { estimateFood, mealTypeForHour } from '../lib/nutrition'
import { estimateFoodWithOpenAI, transcribeMealAudio } from '../lib/openai'
import type { MealEntry } from '../types'

interface Props { onClose: () => void; onAdd: (entry: MealEntry) => void }

interface VoiceRecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}

interface VoiceRecognitionEvent {
  resultIndex: number
  results: { length: number; [index: number]: VoiceRecognitionResult }
}

interface VoiceRecognitionErrorEvent { error: string }

interface VoiceRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((event: VoiceRecognitionEvent) => void) | null
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type VoiceRecognitionConstructor = new () => VoiceRecognition

function voiceRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as typeof window & {
    SpeechRecognition?: VoiceRecognitionConstructor
    webkitSpeechRecognition?: VoiceRecognitionConstructor
  }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

const nowTime = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const normalizedVoiceWord = (word: string) => word.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9À-ɏ]/gi, '')

function normalizeVoiceTranscript(transcript: string) {
  const normalizedWords: string[] = []
  for (const word of transcript.trim().split(/\s+/).filter(Boolean)) {
    const currentWord = normalizedVoiceWord(word)
    const previousWord = normalizedWords.length ? normalizedVoiceWord(normalizedWords[normalizedWords.length - 1]) : ''
    if (currentWord && currentWord === previousWord) continue
    normalizedWords.push(word)
  }
  return normalizedWords.join(' ')
}

function mergeVoiceSegments(segments: Array<[number, string]>) {
  const mergedWords: string[] = []

  for (const [, transcript] of segments.sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)) {
    const words = transcript.trim().split(/\s+/).filter(Boolean)
    if (!words.length) continue

    let overlap = 0
    const maximumOverlap = Math.min(mergedWords.length, words.length)
    for (let size = maximumOverlap; size >= 2; size -= 1) {
      const previous = mergedWords.slice(-size).map(normalizedVoiceWord)
      const current = words.slice(0, size).map(normalizedVoiceWord)
      if (previous.every((word, index) => word === current[index])) {
        overlap = size
        break
      }
    }
    mergedWords.push(...words.slice(overlap))
  }

  return normalizeVoiceTranscript(mergedWords.join(' '))
}

export function AddMealModal({ onClose, onAdd }: Props) {
  const [description, setDescription] = useState('')
  const [time, setTime] = useState(nowTime())
  const [aiEstimate, setAiEstimate] = useState<Awaited<ReturnType<typeof estimateFoodWithOpenAI>> | null>(null)
  const [aiError, setAiError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceInterim, setVoiceInterim] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceMode, setVoiceMode] = useState<'native' | 'recording' | ''>('')
  const recognitionRef = useRef<VoiceRecognition | null>(null)
  const voiceBaseDescriptionRef = useRef('')
  const voiceFinalSegmentsRef = useRef<Map<number, string>>(new Map())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimeoutRef = useRef<number | null>(null)
  const discardRecordingRef = useRef(false)
  const voiceSupported = useMemo(() => Boolean(voiceRecognitionConstructor()) || (typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)), [])
  const localBreakdown = useMemo(() => estimateFood(description), [description])
  const breakdown = aiEstimate?.items || localBreakdown
  const estimated = aiEstimate?.totalCalories ?? breakdown.reduce((sum, item) => sum + item.calories, 0)
  const [manualCalories, setManualCalories] = useState<number | ''>('')
  const calories = manualCalories === '' ? estimated : Number(manualCalories)
  const canSave = description.trim().length > 2 && calories > 0

  useEffect(() => () => {
    recognitionRef.current?.abort()
    discardRecordingRef.current = true
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current)
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  function resetEstimate() {
    setManualCalories('')
    setAiEstimate(null)
    setAiError('')
  }

  function appendTranscript(transcript: string) {
    const normalizedTranscript = normalizeVoiceTranscript(transcript)
    if (!normalizedTranscript) return
    setDescription(current => normalizeVoiceTranscript(`${current.trim()} ${normalizedTranscript}`))
    resetEstimate()
  }

  function replaceNativeTranscript() {
    const finalTranscript = mergeVoiceSegments([...voiceFinalSegmentsRef.current.entries()])
    const baseDescription = voiceBaseDescriptionRef.current.trim()
    setDescription(`${baseDescription}${baseDescription && finalTranscript ? ' ' : ''}${finalTranscript}`)
    resetEstimate()
  }

  function stopRecordingTracks() {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
    recordingStreamRef.current = null
  }

  async function finishRecordedVoiceInput(mimeType: string) {
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current)
    recordingTimeoutRef.current = null
    stopRecordingTracks()
    setIsListening(false)
    setVoiceMode('')
    recorderRef.current = null
    if (discardRecordingRef.current) return
    const audio = new Blob(recordingChunksRef.current, { type: mimeType || 'audio/webm' })
    recordingChunksRef.current = []
    if (audio.size < 500) {
      setVoiceError('A gravação ficou muito curta. Fale por alguns segundos e tente novamente.')
      return
    }
    setIsTranscribing(true)
    try {
      appendTranscript(await transcribeMealAudio(audio))
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Não foi possível transcrever a gravação.')
    } finally {
      setIsTranscribing(false)
    }
  }

  async function startRecordedVoiceInput() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError('O ditado por voz não está disponível neste navegador.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const supportedType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream)
      discardRecordingRef.current = false
      recordingStreamRef.current = stream
      recordingChunksRef.current = []
      recorderRef.current = recorder
      recorder.ondataavailable = event => { if (event.data.size > 0) recordingChunksRef.current.push(event.data) }
      recorder.onerror = () => {
        setVoiceError('Não foi possível gravar o áudio do microfone.')
        stopRecordingTracks()
        setIsListening(false)
        setVoiceMode('')
      }
      recorder.onstop = () => void finishRecordedVoiceInput(recorder.mimeType || supportedType || 'audio/webm')
      recorder.start()
      setIsListening(true)
      setVoiceMode('recording')
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 45_000)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      setVoiceError(name === 'NotAllowedError' ? 'Permita o uso do microfone no navegador para registrar por voz.' : 'Não foi possível acessar o microfone.')
      stopRecordingTracks()
    }
  }

  function toggleVoiceInput() {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop()
      else if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      return
    }
    const Recognition = voiceRecognitionConstructor()
    if (!Recognition) {
      void startRecordedVoiceInput()
      return
    }

    setVoiceError('')
    setVoiceInterim('')
    voiceBaseDescriptionRef.current = description
    voiceFinalSegmentsRef.current = new Map()
    const recognition = new Recognition()
    recognition.lang = 'pt-BR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onstart = () => { setIsListening(true); setVoiceMode('native') }
    recognition.onresult = event => {
      let interimTranscript = ''
      let finalTranscriptChanged = false
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || ''
        if (event.results[index].isFinal) {
          if (voiceFinalSegmentsRef.current.get(index) !== transcript) {
            voiceFinalSegmentsRef.current.set(index, transcript)
            finalTranscriptChanged = true
          }
        } else {
          interimTranscript += ` ${transcript}`
        }
      }
      setVoiceInterim(interimTranscript.trim())
      if (finalTranscriptChanged) replaceNativeTranscript()
    }
    recognition.onerror = event => {
      const messages: Record<string, string> = {
        'not-allowed': 'Permita o uso do microfone no navegador para registrar por voz.',
        'service-not-allowed': 'O serviço de reconhecimento de voz foi bloqueado pelo navegador.',
        'audio-capture': 'Nenhum microfone disponível foi encontrado.',
        'no-speech': 'Não conseguimos detectar sua fala. Tente novamente mais perto do microfone.',
        network: 'O serviço de voz ficou indisponível. Verifique sua conexão e tente novamente.',
        'language-not-supported': 'O reconhecimento em português não está disponível neste navegador.',
      }
      if (event.error !== 'aborted') setVoiceError(messages[event.error] || 'Não foi possível transcrever sua fala agora.')
    }
    recognition.onend = () => {
      setIsListening(false)
      setVoiceMode('')
      setVoiceInterim('')
      voiceFinalSegmentsRef.current = new Map()
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    try { recognition.start() }
    catch { setVoiceError('Não foi possível iniciar o microfone. Tente novamente.'); recognitionRef.current = null }
  }

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
            <textarea autoFocus rows={4} placeholder="Ex.: comi 3 uvas encapadas e tomei um café sem açúcar" value={description} onChange={event => { setDescription(event.target.value); resetEstimate(); setVoiceError('') }} />
            {voiceInterim && <div className="voice-interim" aria-live="polite"><span className="voice-pulse" /> {voiceInterim}</div>}
            <div className="meal-assist-row"><small className="field-hint"><Sparkles size={13} /> Inclua quantidades sempre que puder.</small><div className="meal-assist-actions"><button type="button" className={`voice-input-button ${isListening ? 'listening' : ''}`} aria-pressed={isListening} disabled={isTranscribing} title={voiceSupported ? 'Descrever refeição por voz' : 'Ditado indisponível neste navegador'} onClick={toggleVoiceInput}>{isTranscribing ? <LoaderCircle className="spin" size={15} /> : isListening ? <MicOff size={15} /> : <Mic size={15} />}{isTranscribing ? 'Transcrevendo…' : isListening ? 'Parar' : 'Ditar'}</button><button type="button" className="ai-estimate-button" disabled={description.trim().length < 3 || isAnalyzing || isTranscribing} onClick={analyzeWithAi}>{isAnalyzing ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{isAnalyzing ? 'Calculando...' : 'Calcular refeição'}</button></div></div>
            {isListening && <small className="voice-status" role="status"><span className="voice-pulse" /> {voiceMode === 'native' ? 'Ouvindo em português… fale os alimentos e as quantidades.' : 'Gravando… fale os alimentos e as quantidades. Limite de 45 segundos.'}</small>}
            {isTranscribing && <small className="voice-status" role="status"><LoaderCircle className="spin" size={13} /> Convertendo sua gravação em texto…</small>}
            {voiceError && <small className="voice-error" role="alert"><Info size={13} /> {voiceError}</small>}
            {voiceSupported && <small className="voice-privacy">Em navegadores sem ditado nativo, o áudio é enviado à OpenAI somente para transcrição e não é armazenado pelo VivaMeta.</small>}
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
