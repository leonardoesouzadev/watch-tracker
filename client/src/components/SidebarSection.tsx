import type { ReactNode } from 'react'

interface Props {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
}

export function SidebarSection({ title, icon, children, className }: Props) {
  return (
    <section className={`border-t border-white/6 pt-6 ${className ?? ''}`}>
      <h2 className="eyebrow mb-4 flex items-center gap-2 text-sidebar-muted">
        <span className="text-gold">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
