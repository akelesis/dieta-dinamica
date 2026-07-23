import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, Clock3, Database, ImagePlus, Info, LoaderCircle, Mic, MicOff, Pencil, Plus, Sparkles, Trash2, WandSparkles, X } from 'lucide-react'
import { estimateFood, mealTypeForHour } from '../lib/nutrition'
import { analyzeMealImage, estimateFoodWithOpenAI, transcribeMealAudio } from '../lib/openai'
import { formatDetectedMealDescription, prepareMealImage } from '../lib/meal-image'
import type { DetectedMealItem, MealEntry, MealImageAnalysis } from '../types'

interface Props { onClose: () => void; onAdd: (entry: MealEntry) => void; initialEntry?: MealEntry | null }

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
const NATIVE_LISTENING_LIMIT_MS = 120_000
const RECORDED_LISTENING_LIMIT_MS = 90_000
const RECOGNITION_RESTART_DELAY_MS = 150

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

export function AddMealModal({ onClose, onAdd, initialEntry = null }: Props) {
  const [description, setDescription] = useState(initialEntry?.description || '')
  const [time, setTime] = useState(initialEntry?.time || nowTime())
  const [aiEstimate, setAiEstimate] = useState<Awaited<ReturnType<typeof estimateFoodWithOpenAI>> | null>(null)
  const [savedBreakdown, setSavedBreakdown] = useState<MealEntry['breakdown'] | null>(initialEntry?.breakdown || null)
  const [aiError, setAiError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceInterim, setVoiceInterim] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceMode, setVoiceMode] = useState<'native' | 'recording' | ''>('')
  const [photoAnalysis, setPhotoAnalysis] = useState<MealImageAnalysis | null>(null)
  const [photoItems, setPhotoItems] = useState<DetectedMealItem[]>([])
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false)
  const recognitionRef = useRef<VoiceRecognition | null>(null)
  const recognitionShouldContinueRef = useRef(false)
  const recognitionRestartTimeoutRef = useRef<number | null>(null)
  const recognitionSessionTimeoutRef = useRef<number | null>(null)
  const voiceBaseDescriptionRef = useRef('')
  const voiceCommittedTranscriptRef = useRef('')
  const voiceFinalSegmentsRef = useRef<Map<number, string>>(new Map())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimeoutRef = useRef<number | null>(null)
  const discardRecordingRef = useRef(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const voiceSupported = useMemo(() => Boolean(voiceRecognitionConstructor()) || (typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)), [])
  const localBreakdown = useMemo(() => estimateFood(description), [description])
  const breakdown = aiEstimate?.items || savedBreakdown || localBreakdown
  const estimated = aiEstimate?.totalCalories ?? breakdown.reduce((sum, item) => sum + item.calories, 0)
  const [manualCalories, setManualCalories] = useState<number | ''>(initialEntry?.calories || '')
  const calories = manualCalories === '' ? estimated : Number(manualCalories)
  const canSave = description.trim().length > 2 && calories > 0

  useEffect(() => () => {
    recognitionShouldContinueRef.current = false
    if (recognitionRestartTimeoutRef.current) window.clearTimeout(recognitionRestartTimeoutRef.current)
    if (recognitionSessionTimeoutRef.current) window.clearTimeout(recognitionSessionTimeoutRef.current)
    recognitionRef.current?.abort()
    discardRecordingRef.current = true
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current)
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  useEffect(() => () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
  }, [photoPreviewUrl])

  function resetEstimate() {
    setManualCalories('')
    setAiEstimate(null)
    setSavedBreakdown(null)
    setAiError('')
  }

  function appendTranscript(transcript: string) {
    const normalizedTranscript = normalizeVoiceTranscript(transcript)
    if (!normalizedTranscript) return
    setDescription(current => normalizeVoiceTranscript(`${current.trim()} ${normalizedTranscript}`))
    resetEstimate()
  }

  function replaceNativeTranscript() {
    const currentTranscript = mergeVoiceSegments([...voiceFinalSegmentsRef.current.entries()])
    const finalTranscript = mergeVoiceSegments([
      [0, voiceCommittedTranscriptRef.current],
      [1, currentTranscript],
    ])
    const baseDescription = voiceBaseDescriptionRef.current.trim()
    setDescription(`${baseDescription}${baseDescription && finalTranscript ? ' ' : ''}${finalTranscript}`)
    resetEstimate()
  }

  function commitNativeTranscript() {
    const currentTranscript = mergeVoiceSegments([...voiceFinalSegmentsRef.current.entries()])
    voiceCommittedTranscriptRef.current = mergeVoiceSegments([
      [0, voiceCommittedTranscriptRef.current],
      [1, currentTranscript],
    ])
    voiceFinalSegmentsRef.current = new Map()
    replaceNativeTranscript()
  }

  function finishNativeVoiceInput() {
    if (recognitionRestartTimeoutRef.current) window.clearTimeout(recognitionRestartTimeoutRef.current)
    if (recognitionSessionTimeoutRef.current) window.clearTimeout(recognitionSessionTimeoutRef.current)
    recognitionRestartTimeoutRef.current = null
    recognitionSessionTimeoutRef.current = null
    recognitionShouldContinueRef.current = false
    commitNativeTranscript()
    setIsListening(false)
    setVoiceMode('')
    setVoiceInterim('')
    recognitionRef.current = null
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
      }, RECORDED_LISTENING_LIMIT_MS)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      setVoiceError(name === 'NotAllowedError' ? 'Permita o uso do microfone no navegador para registrar por voz.' : 'Não foi possível acessar o microfone.')
      stopRecordingTracks()
    }
  }

  function toggleVoiceInput() {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionShouldContinueRef.current = false
        if (recognitionRestartTimeoutRef.current) window.clearTimeout(recognitionRestartTimeoutRef.current)
        recognitionRestartTimeoutRef.current = null
        try { recognitionRef.current.stop() }
        catch { finishNativeVoiceInput() }
      }
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
    voiceCommittedTranscriptRef.current = ''
    voiceFinalSegmentsRef.current = new Map()
    recognitionShouldContinueRef.current = true
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
      if (event.error === 'aborted') return
      if (event.error === 'no-speech' && recognitionShouldContinueRef.current) {
        setVoiceError('')
        return
      }
      recognitionShouldContinueRef.current = false
      setVoiceError(messages[event.error] || 'Não foi possível transcrever sua fala agora.')
    }
    recognition.onend = () => {
      commitNativeTranscript()
      setVoiceInterim('')
      if (recognitionShouldContinueRef.current) {
        recognitionRestartTimeoutRef.current = window.setTimeout(() => {
          recognitionRestartTimeoutRef.current = null
          if (!recognitionShouldContinueRef.current) return
          try { recognition.start() }
          catch {
            setVoiceError('Não foi possível manter o microfone ativo. Toque em Ditar para continuar.')
            finishNativeVoiceInput()
          }
        }, RECOGNITION_RESTART_DELAY_MS)
        return
      }
      finishNativeVoiceInput()
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      recognitionSessionTimeoutRef.current = window.setTimeout(() => {
        recognitionShouldContinueRef.current = false
        try { recognition.stop() } catch { finishNativeVoiceInput() }
      }, NATIVE_LISTENING_LIMIT_MS)
    }
    catch {
      recognitionShouldContinueRef.current = false
      setVoiceError('Não foi possível iniciar o microfone. Tente novamente.')
      recognitionRef.current = null
    }
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
    onAdd({ id: initialEntry?.id || crypto.randomUUID(), time, description: description.trim(), calories, mealType: mealTypeForHour(time), breakdown: savedBreakdown })
  }

  async function calculateEstimate(value: string) {
    const normalizedDescription = value.trim()
    if (normalizedDescription.length < 3 || isAnalyzing) return false
    setIsAnalyzing(true)
    setAiError('')
    try {
      const result = await estimateFoodWithOpenAI(normalizedDescription)
      setAiEstimate(result)
      setSavedBreakdown(null)
      setManualCalories('')
      return true
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Não foi possível analisar a refeição.')
      return false
    } finally {
      setIsAnalyzing(false)
    }
  }

  function analyzeWithAi() {
    void calculateEstimate(description)
  }

  async function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || isAnalyzingPhoto) return
    setPhotoError('')
    setPhotoAnalysis(null)
    setPhotoItems([])
    setPhotoPreviewUrl('')
    setIsAnalyzingPhoto(true)
    try {
      const preparedImage = await prepareMealImage(file)
      setPhotoPreviewUrl(URL.createObjectURL(preparedImage))
      const result = await analyzeMealImage(preparedImage)
      setPhotoAnalysis(result)
      setPhotoItems(result.items)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Não foi possível analisar a foto.')
    } finally {
      setIsAnalyzingPhoto(false)
    }
  }

  function updatePhotoItem(index: number, patch: Partial<DetectedMealItem>) {
    setPhotoItems(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
    resetEstimate()
  }

  function removePhotoItem(index: number) {
    setPhotoItems(items => items.filter((_, itemIndex) => itemIndex !== index))
    resetEstimate()
  }

  function addPhotoItem() {
    setPhotoItems(items => [...items, { name: '', quantity: 100, unit: 'g', confidence: 'low' }])
    resetEstimate()
  }

  async function confirmPhotoItems() {
    const detectedDescription = formatDetectedMealDescription(photoItems)
    if (detectedDescription.length < 3) {
      setPhotoError('Revise os alimentos detectados antes de calcular.')
      return
    }
    setDescription(detectedDescription)
    setPhotoError('')
    await calculateEstimate(detectedDescription)
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="meal-title">
        <header className="modal-header"><div><span className="modal-icon">{initialEntry ? <Pencil size={20} /> : <Plus size={21} />}</span><div><small>{initialEntry ? 'Editar registro' : 'Novo registro'}</small><h2 id="meal-title">{initialEntry ? 'Editar refeição' : 'O que você comeu?'}</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>
        <div className="modal-body">
          <div className="field meal-description-field">
            <label htmlFor="meal-description">Descreva sua refeição</label>
            <textarea id="meal-description" autoFocus rows={4} placeholder="Ex.: comi 3 uvas encapadas e tomei um café sem açúcar" value={description} onChange={event => { setDescription(event.target.value); resetEstimate(); setVoiceError('') }} />
            {voiceInterim && <div className="voice-interim" aria-live="polite"><span className="voice-pulse" /> {voiceInterim}</div>}
            <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handlePhotoSelected} />
            <div className="meal-assist-row"><small className="field-hint"><Sparkles size={13} /> Inclua quantidades sempre que puder.</small><div className="meal-assist-actions"><button type="button" className="photo-input-button" disabled={isAnalyzingPhoto || isListening || isTranscribing} onClick={() => photoInputRef.current?.click()}>{isAnalyzingPhoto ? <LoaderCircle className="spin" size={15} /> : <Camera size={15} />}{isAnalyzingPhoto ? 'Analisando…' : 'Foto'}</button><button type="button" className={`voice-input-button ${isListening ? 'listening' : ''}`} aria-pressed={isListening} disabled={isTranscribing || isAnalyzingPhoto} title={voiceSupported ? 'Descrever refeição por voz' : 'Ditado indisponível neste navegador'} onClick={toggleVoiceInput}>{isTranscribing ? <LoaderCircle className="spin" size={15} /> : isListening ? <MicOff size={15} /> : <Mic size={15} />}{isTranscribing ? 'Transcrevendo…' : isListening ? 'Parar' : 'Ditar'}</button><button type="button" className="ai-estimate-button" disabled={description.trim().length < 3 || isAnalyzing || isTranscribing || isAnalyzingPhoto} onClick={analyzeWithAi}>{isAnalyzing ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{isAnalyzing ? 'Calculando...' : 'Calcular refeição'}</button></div></div>
            {isListening && <small className="voice-status" role="status"><span className="voice-pulse" /> {voiceMode === 'native' ? 'Ouvindo em português… faça pausas normalmente e toque em Parar quando terminar. Limite de 2 minutos.' : 'Gravando… fale os alimentos e as quantidades. Limite de 90 segundos.'}</small>}
            {isTranscribing && <small className="voice-status" role="status"><LoaderCircle className="spin" size={13} /> Convertendo sua gravação em texto…</small>}
            {voiceError && <small className="voice-error" role="alert"><Info size={13} /> {voiceError}</small>}
            {(voiceSupported || photoPreviewUrl) && <small className="voice-privacy">Áudio e fotos são enviados à OpenAI somente para análise e não são armazenados pelo VivaMeta.</small>}
          </div>

          {(photoPreviewUrl || isAnalyzingPhoto) && (
            <section className="photo-analysis-card" aria-labelledby="photo-analysis-title">
              <div className="photo-analysis-header">
                <div className="photo-preview">
                  {photoPreviewUrl ? <img src={photoPreviewUrl} alt="Foto selecionada da refeição" /> : <ImagePlus size={24} />}
                  {isAnalyzingPhoto && <span className="photo-loading"><LoaderCircle className="spin" size={23} /></span>}
                </div>
                <div>
                  <small>Análise da foto</small>
                  <strong id="photo-analysis-title">{isAnalyzingPhoto ? 'Identificando os alimentos…' : 'Revise antes de calcular'}</strong>
                  <span>{isAnalyzingPhoto ? 'Isso pode levar alguns segundos.' : 'Corrija nomes e porções que não estejam certos.'}</span>
                </div>
                {!isAnalyzingPhoto && <button type="button" className="icon-button" aria-label="Escolher outra foto" title="Escolher outra foto" onClick={() => photoInputRef.current?.click()}><Camera size={17} /></button>}
              </div>

              {!isAnalyzingPhoto && photoItems.length > 0 && (
                <>
                  <div className="photo-detected-items">
                    {photoItems.map((item, index) => (
                      <div className="photo-detected-row" key={index}>
                        <input aria-label={`Alimento ${index + 1}`} value={item.name} placeholder="Alimento" onChange={event => updatePhotoItem(index, { name: event.target.value })} />
                        <input aria-label={`Quantidade do alimento ${index + 1}`} type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => updatePhotoItem(index, { quantity: Number(event.target.value) })} />
                        <input aria-label={`Unidade do alimento ${index + 1}`} value={item.unit} placeholder="g" onChange={event => updatePhotoItem(index, { unit: event.target.value })} />
                        <button type="button" className="meal-action delete" aria-label={`Remover ${item.name || `alimento ${index + 1}`}`} onClick={() => removePhotoItem(index)}><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                  {(photoAnalysis?.note || photoAnalysis?.question) && <div className="photo-analysis-note"><Info size={14} /><span>{[photoAnalysis.note, photoAnalysis.question].filter(Boolean).join(' ')}</span></div>}
                  <div className="photo-analysis-actions">
                    <button type="button" className="button ghost compact" onClick={addPhotoItem}><Plus size={15} /> Adicionar item</button>
                    <button type="button" className="button primary compact" disabled={isAnalyzing || !formatDetectedMealDescription(photoItems)} onClick={confirmPhotoItems}>{isAnalyzing ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{isAnalyzing ? 'Calculando…' : 'Confirmar e calcular'}</button>
                  </div>
                </>
              )}
              {photoError && <div className="photo-analysis-error" role="alert"><Info size={14} /> {photoError}</div>}
            </section>
          )}
          {photoError && !photoPreviewUrl && <div className="ai-error"><Info size={16} /><span>{photoError} Você ainda pode descrever a refeição por texto ou voz.</span></div>}
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
        <footer className="modal-actions"><button className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!canSave} onClick={save}>{initialEntry ? 'Salvar alterações' : 'Adicionar ao diário'} {initialEntry ? <Check size={18} /> : <Plus size={18} />}</button></footer>
      </section>
    </div>
  )
}
