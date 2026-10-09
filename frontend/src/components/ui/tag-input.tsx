import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TagInputProps {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  suggestions?: string[]
  max?: number
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Chips input: Enter or comma adds a tag; Backspace on an empty field removes the last one. */
export function TagInput({ id, value, onChange, placeholder, suggestions = [], max = 40, ...aria }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').trim()
    if (!tag || tag.length > 60 || value.length >= max) return
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return
    onChange([...value, tag])
    setDraft('')
  }

  const open = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 10)

  return (
    <div>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5 shadow-sm focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100',
          aria['aria-invalid'] && 'border-rose-400',
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-0.5 pl-2 pr-1 text-xs font-medium text-brand-700">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== tag))} className="rounded p-0.5 hover:bg-brand-100" aria-label={`Remove ${tag}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-ink-400"
          {...aria}
        />
      </div>
      {open.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-md border border-dashed border-line px-2 py-0.5 text-xs text-ink-500 hover:border-brand-300 hover:text-brand-700">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
