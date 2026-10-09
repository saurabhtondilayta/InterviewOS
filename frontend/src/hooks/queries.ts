import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Company, JobRole, ProfilePayload, ResumeSummary } from '@/types'

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<ProfilePayload>('/api/profile'),
    enabled,
    staleTime: 60_000,
    retry: (count, err) => count < 2 && !(err && 'status' in err && (err as { status: number }).status < 500),
  })
}

export function useJobRoles() {
  return useQuery({ queryKey: ['job-roles'], queryFn: () => api.get<JobRole[]>('/api/job-roles'), staleTime: 10 * 60_000 })
}

export function useCompanies(q = '') {
  return useQuery({
    queryKey: ['companies', q],
    queryFn: () => api.get<Company[]>(`/api/companies${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 5 * 60_000,
  })
}

export function useResumes() {
  return useQuery({ queryKey: ['resumes'], queryFn: () => api.get<ResumeSummary[]>('/api/resumes') })
}
