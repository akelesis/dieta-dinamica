import { useState, type FormEvent } from 'react'
import { ArrowRight, Leaf, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'

type Mode = 'signin' | 'signup'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    setMessage('')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setMessage('Conta criada. Confira seu e-mail para confirmar o cadastro.')
    }
  }

  function changeMode(next: Mode) {
    setMode(next)
    setError('')
    setMessage('')
  }

  return (
    <div className="auth-shell">
      <header className="onboarding-header"><Logo /><span className="safe-note"><ShieldCheck size={15} /> Seus dados protegidos por login</span></header>
      <main className="auth-main">
        <section className="auth-card">
          <div className="auth-brand-icon"><Leaf size={25} /></div>
          <span className="eyebrow">Sua rotina, sempre com você</span>
          <h1>{mode === 'signin' ? 'Bem-vindo de volta.' : 'Crie sua conta.'}</h1>
          <p>{mode === 'signin' ? 'Entre para acompanhar seu plano e o diário de hoje.' : 'Seu perfil, plano e refeições ficarão sincronizados com segurança.'}</p>
          <form onSubmit={submit}>
            <label className="field"><span>E-mail</span><div className="input-with-icon"><Mail size={18} /><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@email.com" /></div></label>
            <label className="field"><span>Senha</span><div className="input-with-icon"><LockKeyhole size={18} /><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /></div></label>
            {error && <div className="auth-feedback error">{error}</div>}
            {message && <div className="auth-feedback success">{message}</div>}
            <button className="button primary auth-submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'} <ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">
            {mode === 'signin' ? 'Ainda não tem uma conta?' : 'Já possui uma conta?'}
            <button type="button" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Criar conta' : 'Fazer login'}</button>
          </div>
        </section>
      </main>
      <footer>VivaMeta é uma ferramenta educativa e não substitui o acompanhamento de nutricionista ou médico.</footer>
    </div>
  )
}
