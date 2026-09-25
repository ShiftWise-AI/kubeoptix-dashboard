import type { ReactNode } from 'react'

export interface SkeletonListProps {
  label: string
  rows?: number
  className?: string
}

export interface EmptyListStateProps {
  title: string
  description?: string
  icon?: ReactNode
  className?: string
}

export function SkeletonList({ label, rows = 3, className = '' }: SkeletonListProps) {
  return (
    <div
      className={`space-y-2 ${className}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-9 animate-pulse rounded border border-border bg-gray-100 motion-reduce:animate-none"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function EmptyListState({ title, description, icon, className = '' }: EmptyListStateProps) {
  return (
    <div
      className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded border border-border bg-white p-5 text-center ${className}`}
      role="status"
    >
      {icon ? <span className="text-muted-foreground" aria-hidden="true">{icon}</span> : null}
      <p className="m-0 text-sm font-medium text-gray-950">{title}</p>
      {description ? <p className="m-0 max-w-md text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}