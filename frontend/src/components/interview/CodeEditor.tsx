import { useRef } from 'react'
import { Select } from '@/components/ui/form'

export const CODE_LANGUAGES = ['python', 'java', 'cpp', 'javascript', 'typescript', 'c', 'go', 'csharp', 'kotlin']

/** Lightweight code editor (textarea with Tab indentation). Code is reviewed by AI, never executed. */
export function CodeEditor({ value, onChange, language, onLanguage, id = 'code' }: { value: string; onChange: (v: string) => void; language: string; onLanguage: (v: string) => void; id?: string }) {
  const escaped = useRef(false)
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <label htmlFor={`${id}-lang`} className="text-xs text-slate-400">
          Language
        </label>
        <Select id={`${id}-lang`} value={language} onChange={(e) => onLanguage(e.target.value)} className="h-8 w-36 border-slate-600 bg-slate-800 text-xs text-slate-100">
          {CODE_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <textarea
        id={id}
        aria-label="Code editor"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            escaped.current = true
            return
          }
          if (e.key === 'Tab' && escaped.current) {
            escaped.current = false
            return // let focus move on (keyboard accessibility)
          }
          escaped.current = false
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget
            const { selectionStart: s, selectionEnd: end } = el
            const next = value.slice(0, s) + '    ' + value.slice(end)
            onChange(next)
            requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4))
          }
        }}
        className="block min-h-72 w-full resize-y bg-transparent p-3 font-mono text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
        placeholder="// Write your solution here. Explain your approach in comments if helpful."
      />
      <p className="border-t border-slate-700 px-3 py-1.5 text-[0.7rem] text-slate-400">Tab inserts 4 spaces. Press Esc then Tab to move focus out of the editor.</p>
    </div>
  )
}
