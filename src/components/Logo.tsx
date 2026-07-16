import { Leaf } from 'lucide-react'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo" aria-label="VivaMeta">
      <span className="logo-mark"><Leaf size={20} strokeWidth={2.5} /></span>
      {!compact && <span>viva<span>meta</span></span>}
    </div>
  )
}
