import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { TagInput } from '@/components/ui/tag-input'
import { api, errorMessage } from '@/lib/api'
import type { Certification, Internship, Profile, ProfilePayload, Project } from '@/types'

export type SectionKey = 'education' | 'skills' | 'projects' | 'experience' | 'goals'

export const SECTIONS: { key: SectionKey; label: string; description: string }[] = [
  { key: 'education', label: 'Education', description: 'Where you study and when you graduate.' },
  { key: 'skills', label: 'Skills', description: 'Technical skills and programming languages.' },
  { key: 'projects', label: 'Projects', description: 'What you have built. Interview questions draw on these.' },
  { key: 'experience', label: 'Experience', description: 'Internships, certifications and interview experience.' },
  { key: 'goals', label: 'Goals', description: 'Target roles, companies, and what you want to improve.' },
]

const LANG_SUGGESTIONS = ['Python', 'Java', 'C++', 'C', 'JavaScript', 'TypeScript', 'Go', 'SQL', 'Kotlin']
const IMPROVEMENT_SUGGESTIONS = ['Data Structures & Algorithms', 'System Design', 'Communication', 'DBMS', 'Operating Systems', 'Computer Networks', 'Behavioral answers', 'Confidence']
const ROLE_SUGGESTIONS = ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'Cloud Engineer', 'DevOps Engineer', 'Data Analyst', 'Machine Learning Engineer']

function useSaveProfile(onSaved?: () => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ changes, skills }: { changes?: Partial<Profile>; skills?: string[] }) => {
      let result: ProfilePayload | undefined
      if (changes && Object.keys(changes).length) result = await api.patch<ProfilePayload>('/api/profile', changes)
      if (skills) result = await api.put<ProfilePayload>('/api/profile/skills', { skills })
      return result
    },
    onSuccess: (data) => {
      if (data) qc.setQueryData(['profile'], data)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Profile saved')
      onSaved?.()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

interface SectionProps {
  data: ProfilePayload
  onSaved?: () => void
  submitLabel?: string
}

const emptyToNull = (v: string) => (v.trim() === '' ? null : v.trim())

export function EducationSection({ data, onSaved, submitLabel = 'Save' }: SectionProps) {
  const p = data.profile
  const [f, setF] = useState({
    full_name: p.full_name,
    college: p.college ?? '',
    degree: p.degree ?? '',
    branch: p.branch ?? '',
    current_year: p.current_year ?? '',
    graduation_year: p.graduation_year ?? '',
    current_education: p.current_education ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const save = useSaveProfile(onSaved)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (f.full_name.trim().length < 2) return setError('Enter your full name.')
    const gy = Number(f.graduation_year)
    if (f.graduation_year !== '' && (gy < 1990 || gy > 2100)) return setError('Enter a valid graduation year.')
    setError(null)
    save.mutate({
      changes: {
        full_name: f.full_name.trim(),
        college: emptyToNull(f.college),
        degree: emptyToNull(f.degree),
        branch: emptyToNull(f.branch),
        current_year: f.current_year === '' ? null : Number(f.current_year),
        graduation_year: f.graduation_year === '' ? null : gy,
        current_education: emptyToNull(f.current_education),
      },
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {error && <p className="text-sm text-rose-600 sm:col-span-2" role="alert">{error}</p>}
      <Field label="Full name" htmlFor="full_name" className="sm:col-span-2" required>
        <Input value={f.full_name} onChange={set('full_name')} maxLength={120} />
      </Field>
      <Field label="College or university" htmlFor="college" className="sm:col-span-2">
        <Input value={f.college} onChange={set('college')} maxLength={200} />
      </Field>
      <Field label="Degree" htmlFor="degree">
        <Input value={f.degree} onChange={set('degree')} maxLength={120} />
      </Field>
      <Field label="Branch" htmlFor="branch">
        <Input value={f.branch} onChange={set('branch')} maxLength={120} />
      </Field>
      <Field label="Current year" htmlFor="current_year">
        <Select value={String(f.current_year)} onChange={set('current_year')}>
          <option value="">Not studying / not set</option>
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Graduation year" htmlFor="graduation_year">
        <Input type="number" value={f.graduation_year} onChange={set('graduation_year')} />
      </Field>
      <Field label="Current education summary" htmlFor="current_education" hint="e.g. Third-year B.Tech CSE specialising in Cloud Computing, CGPA 8.4" className="sm:col-span-2">
        <Input value={f.current_education} onChange={set('current_education')} maxLength={300} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={save.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function SkillsSection({ data, onSaved, submitLabel = 'Save' }: SectionProps) {
  const [skills, setSkills] = useState<string[]>(data.skills)
  const [langs, setLangs] = useState<string[]>(data.profile.programming_languages)
  const save = useSaveProfile(onSaved)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ changes: { programming_languages: langs }, skills })
      }}
      className="space-y-4"
    >
      <Field label="Technical skills" htmlFor="skills" hint="Frameworks, tools, platforms and CS subjects you are comfortable with.">
        <TagInput value={skills} onChange={setSkills} placeholder="e.g. React, Docker, DBMS" max={60} />
      </Field>
      <Field label="Programming languages" htmlFor="langs">
        <TagInput value={langs} onChange={setLangs} placeholder="Add a language" suggestions={LANG_SUGGESTIONS} max={25} />
      </Field>
      <Button type="submit" loading={save.isPending}>
        {submitLabel}
      </Button>
    </form>
  )
}

export function ProjectsSection({ data, onSaved, submitLabel = 'Save' }: SectionProps) {
  const [items, setItems] = useState<Project[]>(data.profile.projects)
  const [error, setError] = useState<string | null>(null)
  const save = useSaveProfile(onSaved)
  const update = (i: number, patch: Partial<Project>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const cleaned = items.map((p) => ({ ...p, title: p.title.trim(), link: p.link?.trim() || null }))
        if (cleaned.some((p) => !p.title)) return setError('Every project needs a title.')
        if (cleaned.some((p) => p.link && !/^https?:\/\//.test(p.link))) return setError('Project links must start with http:// or https://')
        setError(null)
        save.mutate({ changes: { projects: cleaned } })
      }}
      className="space-y-4"
    >
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      {items.length === 0 && <p className="text-sm text-ink-500">No projects added yet.</p>}
      {items.map((p, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-line p-4">
          <div className="flex items-start gap-3">
            <Field label="Project title" htmlFor={`p-title-${i}`} className="flex-1">
              <Input value={p.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={120} />
            </Field>
            <Button type="button" variant="ghost" size="icon" className="mt-6" aria-label="Remove project" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
          <Field label="What did you build and what was the impact?" htmlFor={`p-desc-${i}`}>
            <Textarea value={p.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={1500} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Technologies" htmlFor={`p-tech-${i}`}>
              <TagInput value={p.technologies} onChange={(t) => update(i, { technologies: t })} placeholder="Add technology" max={20} />
            </Field>
            <Field label="Link (optional)" htmlFor={`p-link-${i}`}>
              <Input type="url" value={p.link ?? ''} onChange={(e) => update(i, { link: e.target.value })} placeholder="https://" />
            </Field>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setItems([...items, { title: '', description: '', technologies: [], link: null }])} disabled={items.length >= 15}>
          <Plus /> Add project
        </Button>
        <Button type="submit" loading={save.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function ExperienceSection({ data, onSaved, submitLabel = 'Save' }: SectionProps) {
  const p = data.profile
  const [internships, setInternships] = useState<Internship[]>(p.internships)
  const [certs, setCerts] = useState<Certification[]>(p.certifications)
  const [years, setYears] = useState(String(p.years_experience ?? 0))
  const [interviewExp, setInterviewExp] = useState(p.interview_experience ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveProfile(onSaved)
  const updI = (i: number, patch: Partial<Internship>) => setInternships(internships.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const updC = (i: number, patch: Partial<Certification>) => setCerts(certs.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (internships.some((i) => !i.organization.trim() || !i.role.trim())) return setError('Each internship needs an organisation and a role.')
        if (certs.some((c) => !c.name.trim())) return setError('Each certification needs a name.')
        const y = Number(years)
        if (Number.isNaN(y) || y < 0 || y > 50) return setError('Years of experience must be between 0 and 50.')
        setError(null)
        save.mutate({
          changes: {
            internships,
            certifications: certs.map((c) => ({ ...c, year: c.year ? Number(c.year) : null, issuer: c.issuer || null })),
            years_experience: y,
            interview_experience: interviewExp.trim() || null,
          },
        })
      }}
      className="space-y-6"
    >
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Internships & work experience</h3>
        {internships.length === 0 && <p className="text-sm text-ink-500">None added yet.</p>}
        {internships.map((it, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
            <Field label="Organisation" htmlFor={`i-org-${i}`}>
              <Input value={it.organization} onChange={(e) => updI(i, { organization: e.target.value })} />
            </Field>
            <Field label="Role" htmlFor={`i-role-${i}`}>
              <Input value={it.role} onChange={(e) => updI(i, { role: e.target.value })} />
            </Field>
            <Field label="Start" htmlFor={`i-start-${i}`}>
              <Input type="month" value={it.start ?? ''} onChange={(e) => updI(i, { start: e.target.value })} />
            </Field>
            <Field label="End" htmlFor={`i-end-${i}`} hint="Leave empty if ongoing">
              <Input type="month" value={it.end ?? ''} onChange={(e) => updI(i, { end: e.target.value })} />
            </Field>
            <Field label="What did you work on?" htmlFor={`i-desc-${i}`} className="sm:col-span-2">
              <Textarea value={it.description} onChange={(e) => updI(i, { description: e.target.value })} maxLength={1500} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setInternships(internships.filter((_, j) => j !== i))}>
                <Trash2 /> Remove
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setInternships([...internships, { organization: '', role: '', start: '', end: '', description: '' }])}>
          <Plus /> Add internship
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Certifications</h3>
        {certs.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <Field label="Name" htmlFor={`c-name-${i}`} className="min-w-48 flex-1">
              <Input value={c.name} onChange={(e) => updC(i, { name: e.target.value })} />
            </Field>
            <Field label="Issuer" htmlFor={`c-issuer-${i}`} className="w-40">
              <Input value={c.issuer ?? ''} onChange={(e) => updC(i, { issuer: e.target.value })} />
            </Field>
            <Field label="Year" htmlFor={`c-year-${i}`} className="w-24">
              <Input type="number" value={c.year ?? ''} onChange={(e) => updC(i, { year: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove certification" onClick={() => setCerts(certs.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setCerts([...certs, { name: '', issuer: '', year: null }])}>
          <Plus /> Add certification
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field label="Years of experience" htmlFor="years">
          <Input type="number" step="0.5" min={0} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
        </Field>
        <Field label="Interview experience so far" htmlFor="interview_exp" hint="e.g. Two campus aptitude rounds, one technical interview. Nervous in HR rounds.">
          <Textarea value={interviewExp} onChange={(e) => setInterviewExp(e.target.value)} maxLength={2000} />
        </Field>
      </div>
      <Button type="submit" loading={save.isPending}>
        {submitLabel}
      </Button>
    </form>
  )
}

export function GoalsSection({ data, onSaved, submitLabel = 'Save' }: SectionProps) {
  const p = data.profile
  const [roles, setRoles] = useState<string[]>(p.target_roles.length ? p.target_roles : p.preferred_role ? [p.preferred_role] : [])
  const [companies, setCompanies] = useState<string[]>(p.preferred_companies)
  const [areas, setAreas] = useState<string[]>(p.improvement_areas)
  const [hours, setHours] = useState(p.weekly_study_hours ? String(p.weekly_study_hours) : '')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveProfile(onSaved)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!roles.length) return setError('Add at least one target role.')
        const h = hours ? Number(hours) : null
        if (h !== null && (h < 1 || h > 80)) return setError('Weekly study hours must be between 1 and 80.')
        setError(null)
        save.mutate({ changes: { target_roles: roles, preferred_role: roles[0], preferred_companies: companies, improvement_areas: areas, weekly_study_hours: h } })
      }}
      className="space-y-4"
    >
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <Field label="Target job roles" htmlFor="roles" hint="The first role is used as your primary target." required>
        <TagInput value={roles} onChange={setRoles} suggestions={ROLE_SUGGESTIONS} placeholder="Add a role" max={10} />
      </Field>
      <Field label="Preferred companies" htmlFor="companies">
        <TagInput value={companies} onChange={setCompanies} placeholder="Add a company" max={20} />
      </Field>
      <Field label="Areas you want to improve" htmlFor="areas">
        <TagInput value={areas} onChange={setAreas} suggestions={IMPROVEMENT_SUGGESTIONS} placeholder="Add an area" max={20} />
      </Field>
      <Field label="Study time available per week (hours)" htmlFor="hours" className="max-w-xs">
        <Input type="number" min={1} max={80} value={hours} onChange={(e) => setHours(e.target.value)} />
      </Field>
      <Button type="submit" loading={save.isPending}>
        {submitLabel}
      </Button>
    </form>
  )
}

export function SectionForm({ section, ...props }: SectionProps & { section: SectionKey }) {
  switch (section) {
    case 'education':
      return <EducationSection {...props} />
    case 'skills':
      return <SkillsSection {...props} />
    case 'projects':
      return <ProjectsSection {...props} />
    case 'experience':
      return <ExperienceSection {...props} />
    case 'goals':
      return <GoalsSection {...props} />
  }
}
