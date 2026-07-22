import { useEffect, useState } from 'react'
import { Check, Download, RefreshCw, Share, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'vivameta:pwa-install-dismissed'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function wasDismissed() {
  try { return sessionStorage.getItem(DISMISSED_KEY) === 'true' } catch { return false }
}

export function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [dismissed, setDismissed] = useState(wasDismissed)
  const ios = isIos()
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Não foi possível registrar o modo offline do VivaMeta.', error)
    },
  })

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const markInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  const dismissInstall = () => {
    try { sessionStorage.setItem(DISMISSED_KEY, 'true') } catch { /* O aviso ainda pode ser fechado nesta sessão. */ }
    setDismissed(true)
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  const closeUpdate = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  const showServiceNotice = offlineReady || needRefresh
  const showInstall = !showServiceNotice && !installed && !dismissed && (Boolean(installPrompt) || ios)

  return <>
    {showInstall && <aside className="pwa-prompt" role="status" aria-live="polite">
      <span className="pwa-prompt-icon"><Download size={21} /></span>
      <div>
        <strong>Instale o VivaMeta</strong>
        <p>{ios ? <>No menu do navegador, toque em <Share size={13} aria-label="Compartilhar" /> e depois em “Adicionar à Tela de Início”.</> : 'Acesse mais rápido pela tela inicial e continue usando a estrutura do app mesmo com conexão instável.'}</p>
      </div>
      {!ios && <button type="button" className="button primary" onClick={install}><Download size={16} /> Instalar</button>}
      <button type="button" className="icon-button pwa-close" aria-label="Agora não" onClick={dismissInstall}><X size={18} /></button>
    </aside>}

    {showServiceNotice && <aside className="pwa-update" role="status" aria-live="polite">
      <span>{needRefresh ? <RefreshCw size={18} /> : <Check size={18} />}</span>
      <div><strong>{needRefresh ? 'Nova versão disponível' : 'VivaMeta pronto para uso offline'}</strong><p>{needRefresh ? 'Atualize quando terminar o que está fazendo.' : 'As telas já abertas poderão ser acessadas em conexões instáveis.'}</p></div>
      {needRefresh && <button type="button" className="button primary" onClick={() => updateServiceWorker(true)}>Atualizar</button>}
      <button type="button" className="icon-button" aria-label="Fechar aviso" onClick={closeUpdate}><X size={17} /></button>
    </aside>}
  </>
}
