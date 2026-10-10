export interface Project {
  title: string
  description: string
  technologies: string[]
  link?: string | null
}
export interface Internship {
  organization: string
  role: string
  start?: string | null
  end?: string | null
  description: string
}
export interface Certification {
  name: string
  issuer?: string | null
  year?: number | null
}

export interface Profile {
  id: string
  email: string
  full_name: string
  college: string | null
  degree: string | null
  branch: string | null
  current_year: number | null
  graduation_year: number | null
  preferred_role: string | null
  years_experience: number
  current_education: string | null
  programming_languages: string[]
  projects: Project[]
  internships: Internship[]
  certifications: Certification[]
  preferred_companies: string[]
  target_roles: string[]
  interview_experience: string | null
  improvement_areas: string[]
  weekly_study_hours: number | null
  onboarding_completed: boolean
  account_type: 'student' | 'recruiter'
  designation: string | null
  created_at: string
}

// --- hiring --------------------------------------------------------------
export interface Org {
  id: string
  name: string
  website: string | null
  industry: string | null
}

export interface OrgOverview {
  org: Org
  role: 'owner' | 'admin' | 'recruiter'
  members: { user_id: string; role: string; profiles: { full_name: string; email: string; designation: string | null } | null }[]
}

export interface Assessment {
  id: string
  title: string
  role_title: string
  job_role_id: string | null
  description: string | null
  mode: 'ai' | 'live'
  interview_type: InterviewType
  experience_level: string
  difficulty: number
  duration_minutes: number
  topics: string[]
  proctoring_enabled: boolean
  show_results_to_candidate: boolean
  accepting_applications: boolean
  public_token: string
  status: 'open' | 'closed'
  created_at: string
  apply_link?: string
  counts?: { total: number; completed: number; pending: number }
}

export type InvitationStatus = 'invited' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled'
export type Decision = 'pending' | 'shortlisted' | 'rejected' | 'hired'

export interface InvitationRow {
  id: string
  candidate_email: string
  candidate_name: string | null
  status: InvitationStatus
  scheduled_at: string | null
  decision: Decision
  integrity_score: number | null
  ai_score: number | null
  created_at: string
  completed_at: string | null
}

export interface ProctorEventRow {
  id: string
  kind: string
  severity: number
  detail: Record<string, unknown>
  occurred_at: string
  snapshot_url?: string | null
}

export interface ProctorSummary {
  verdict?: string
  flags?: { kind: string; label: string; count: number; penalty: number }[]
  total_flags?: number
  note?: string
}

export interface LiveFeedback {
  ratings?: Record<string, number>
  notes?: string
  recommendation?: 'strong_hire' | 'hire' | 'no_hire' | 'strong_no_hire' | 'undecided'
}

export interface CandidateReport {
  invitation: InvitationRow & { hr_notes: string | null; hr_feedback: LiveFeedback; share_resume: boolean; session_id: string | null; proctoring_summary: ProctorSummary; live_started_at: string | null; live_ended_at: string | null }
  assessment: Assessment
  candidate: { full_name: string; email: string; college: string | null; degree: string | null; branch: string | null; graduation_year: number | null; preferred_role: string | null; years_experience: number; skills: string[] } | null
  resume: { filename: string; url: string | null } | null
  interview: {
    session: { status: string; started_at: string | null; ended_at: string | null; answer_mode: string } | null
    report: InterviewReport | null
    questions: { sequence_no: number; topic: string; kind: string; difficulty: number; question_text: string; is_follow_up: boolean; response: { answer_text: string; answer_mode: string } | null; evaluation: Partial<Evaluation> | null }[]
  } | null
  proctoring: { enabled: boolean; integrity_score: number | null; summary: ProctorSummary; events: ProctorEventRow[] }
}

export interface CandidateInvitation {
  id: string
  status: InvitationStatus
  scheduled_at: string | null
  consent_at: string | null
  share_resume: boolean
  session_id: string | null
  created_at: string
  completed_at: string | null
  results_visible: boolean
  company: { name: string; website: string | null }
  assessment: Pick<Assessment, 'id' | 'title' | 'role_title' | 'description' | 'mode' | 'interview_type' | 'difficulty' | 'duration_minutes' | 'proctoring_enabled' | 'status'>
}

export interface ProfilePayload {
  profile: Profile
  skills: string[]
  completion: { percent: number; missing: string[] }
  is_admin: boolean
}

export interface ResumeSummary {
  id: string
  original_filename: string
  mime_type: string
  size_bytes: number
  page_count: number | null
  is_primary: boolean
  created_at: string
  resume_analyses: { id: string; target_role: string; overall_score: number; created_at: string }[]
}

export type ResumeSection =
  | 'structure'
  | 'education'
  | 'skills'
  | 'projects'
  | 'experience'
  | 'certifications'
  | 'keywords'
  | 'achievements'
  | 'ats_formatting'
  | 'role_alignment'

export interface ResumeAnalysisResult {
  overall_assessment: string
  section_scores: { section: ResumeSection; score: number; rationale: string }[]
  strengths: string[]
  weaknesses: string[]
  missing_skills: { skill: string; importance: 'high' | 'medium' | 'low'; reason: string }[]
  section_suggestions: { section: ResumeSection; suggestions: string[] }[]
  bullet_rewrites: { original: string; improved: string; why: string }[]
  recommended_projects: { title: string; description: string; skills: string[] }[]
  recommended_certifications: { name: string; provider: string; reason: string }[]
  interview_questions: { question: string; topic: string; based_on: string }[]
  ats_issues: string[]
  jd_comparison: { provided: boolean; matched_requirements: string[]; missing_requirements: string[]; summary: string }
  detected_skills: string[]
}

export interface ResumeAnalysis {
  id: string
  resume_id: string
  target_role: string
  job_listing_id: string | null
  overall_score: number
  score_breakdown: Record<string, { score: number; weight: number; contribution: number }>
  result: ResumeAnalysisResult
  model: string
  created_at: string
  score_explanation: string
  disclaimer: string
  resumes?: { original_filename: string }
}

export interface Company {
  id: string
  name: string
  slug: string
  industry: string | null
  official_website: string
  careers_url: string | null
  last_verified_at: string | null
  description?: string | null
  headquarters?: string | null
  job_listings?: { count: number }[]
  company_sources?: CompanySource[]
}

export interface CompanySource {
  id: string
  source_type: string
  url: string
  title: string | null
  notes: string | null
  robots_allowed: boolean | null
  last_status_code: number | null
  last_checked_at: string | null
}

export interface JobListing {
  id: string
  title: string
  location: string | null
  employment_type: string | null
  experience_min: number | null
  experience_max: number | null
  required_skills: string[]
  source_url: string
  posted_at: string | null
  last_verified_at: string
  status: 'active' | 'stale' | 'closed'
  job_role_id: string | null
  job_roles?: { title: string; slug: string } | null
  description_text?: string | null
}

export interface Competency {
  topic: string
  weight: number
  kind: QuestionKind
}

export interface JobRole {
  id: string
  title: string
  slug: string
  family: string
  description: string
  competencies: Competency[]
  typical_skills: string[]
}

export type InterviewType = 'hr' | 'technical' | 'resume' | 'coding' | 'behavioral' | 'system_design' | 'company' | 'full'
export type QuestionKind = 'technical' | 'behavioral' | 'hr' | 'coding' | 'system_design' | 'resume'

export interface InterviewSession {
  id: string
  role_title: string
  interview_type: InterviewType
  experience_level: string
  start_difficulty: number
  current_difficulty: number
  duration_minutes: number
  target_question_count: number
  topics: string[]
  answer_mode: 'voice' | 'text'
  is_company_specific: boolean
  is_practice: boolean
  rubric_version: string
  status: 'configured' | 'in_progress' | 'completed' | 'abandoned'
  started_at: string | null
  ended_at: string | null
  created_at: string
  company_id: string | null
  plan_topics?: { topic: string; kind: string; weight: number; weak_before: boolean }[]
}

export interface PublicQuestion {
  id: string
  sequence_no: number
  topic: string
  kind: QuestionKind
  difficulty: number
  question_text: string
  is_follow_up: boolean
  details: {
    constraints?: string[]
    examples?: { input: string; output: string; explanation: string | null }[]
    function_signature?: string
  }
  selection_reason: string
  source: string
}

export interface Evaluation {
  id: string
  question_score: number
  communication_score: number | null
  dimension_scores: Record<string, number>
  technical_track: 'coding' | 'system_design' | null
  technical_scores: Record<string, number> | null
  feedback: string
  strengths: string[]
  missing_concepts: string[]
  incorrect_statements: string[]
  model_answer_outline: string[]
  dimension_rationale: string | null
  needs_follow_up: boolean
  follow_up_reason: string | null
  difficulty_before: number
  difficulty_after: number
  adjustment_reason: string
  rubric_version: string
}

export interface InterviewReport {
  id: string
  session_id: string
  rubric_version: string
  interview_type: InterviewType
  overall_score: number | null
  dimension_averages: Record<string, number>
  technical_averages: Record<string, Record<string, number>> | null
  topic_scores: Record<string, { average: number; questions: number }>
  summary: {
    overall_assessment: string
    strengths: string[]
    weaknesses: string[]
    communication_feedback: string
    problem_solving_observations: string
    topics_to_revise: string[]
    recommended_practice: { question: string; topic: string }[]
    next_steps: string[]
  }
  suggested_next_difficulty: number | null
  created_at: string
}

export interface SessionDetail {
  session: InterviewSession
  company: { id: string; name: string; slug: string } | null
  questions: (PublicQuestion & {
    response: { answer_text: string; answer_mode: string; code_language: string | null; duration_seconds: number | null } | null
    evaluation: Evaluation | null
    expected_points?: string[]
  })[]
  report: InterviewReport | null
  disclaimer: string
  results_hidden?: boolean
  assessment?: { invitation_id: string; title: string; company: string; proctoring_enabled: boolean } | null
}

export interface PlanTask {
  id: string
  day_number: number
  sort_order: number
  title: string
  description: string | null
  topic: string | null
  task_type: string
  estimated_minutes: number | null
  completed_at: string | null
}

export interface LearningPlan {
  id: string
  title: string
  duration_days: 7 | 30
  daily_minutes: number
  goals: string | null
  overview: string | null
  is_active: boolean
  start_date: string
  created_at: string
  learning_plan_tasks: PlanTask[]
  progress: { completed: number; total: number; percent: number }
}

export interface ChatConversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface DashboardData {
  interviews_completed: number
  recent_scores: { session_id: string; interview_type: InterviewType; rubric_version: string; overall_score: number | null; role_title: string | null; created_at: string }[]
  strongest_topics: { topic: string; average: number; reports: number }[]
  weakest_topics: { topic: string; average: number; reports: number }[]
  recommended_topics: { topic: string; reason: string }[]
  latest_resume_analysis: { id: string; target_role: string; overall_score: number; created_at: string } | null
  learning_plan:
    | (Pick<LearningPlan, 'id' | 'title' | 'duration_days' | 'start_date'> & {
        progress: { completed: number; total: number }
        upcoming: PlanTask[]
        week: { day: number; minutes: number; completed: number; total: number }[]
      })
    | null
  saved_jobs: SavedJob[]
  recent_activity: { type: string; id: string; label: string; status: string; at: string }[]
}

export interface SavedJob {
  id: string
  created_at: string
  notes?: string | null
  companies: { name: string; slug: string } | null
  job_roles: { title: string; slug?: string } | null
  job_listings: { title: string; source_url?: string; status?: string } | null
}

export interface RolePrep {
  focus_areas: string[]
  skill_gaps: string[]
  matched_strengths: string[]
  practice_questions: { question: string; topic: string; kind: QuestionKind }[]
  preparation_tips: string[]
  basis: 'verified_listing' | 'general_role'
  basis_note: string
  disclaimer: string
}
