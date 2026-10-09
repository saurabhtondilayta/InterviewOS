-- Row Level Security for InterviewOS
--
-- Ownership model
--   * Every user-specific row carries user_id; clients may only ever see rows where
--     user_id = auth.uid().
--   * Records produced by the AI/scoring pipeline (analyses, questions, evaluations,
--     reports, plans, assistant chat messages, usage logs) are written ONLY by the backend
--     with the service role, after the backend has verified ownership through an
--     RLS-scoped read. Clients can read them but cannot forge or edit scores.
--   * Users may directly edit a small set of columns (their profile fields, task
--     completion, conversation titles, saved jobs) - enforced with column-level grants.
--   * Company / role / listing data is readable by any authenticated user and writable
--     only by the service role (backend admin API restricted to admin_users).
--   * The anon role has no access to application tables.

-- Enable RLS everywhere
alter table public.admin_users enable row level security;
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.companies enable row level security;
alter table public.company_sources enable row level security;
alter table public.job_roles enable row level security;
alter table public.job_listings enable row level security;
alter table public.question_bank enable row level security;
alter table public.resumes enable row level security;
alter table public.resume_analyses enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_responses enable row level security;
alter table public.answer_evaluations enable row level security;
alter table public.interview_reports enable row level security;
alter table public.learning_plans enable row level security;
alter table public.learning_plan_tasks enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.usage_logs enable row level security;

-- Start from least privilege for client roles, then grant back what is needed.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
-- question_bank holds expected answer points; only the backend reads it.
revoke select on public.question_bank from authenticated;

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
create policy "admin_users: read own row" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (
  full_name, college, degree, branch, current_year, graduation_year, preferred_role,
  years_experience, current_education, programming_languages, projects, internships,
  certifications, preferred_companies, target_roles, interview_experience,
  improvement_areas, weekly_study_hours, onboarding_completed
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- skills (shared vocabulary) and user_skills
-- ---------------------------------------------------------------------------
create policy "skills: authenticated read" on public.skills
  for select to authenticated using (true);

create policy "user_skills: read own" on public.user_skills
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_skills: insert own" on public.user_skills
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_skills: update own" on public.user_skills
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_skills: delete own" on public.user_skills
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert, delete on public.user_skills to authenticated;
grant update (proficiency) on public.user_skills to authenticated;

-- ---------------------------------------------------------------------------
-- Public reference data
-- ---------------------------------------------------------------------------
create policy "companies: authenticated read" on public.companies
  for select to authenticated using (is_active);
create policy "company_sources: authenticated read" on public.company_sources
  for select to authenticated using (true);
create policy "job_roles: authenticated read" on public.job_roles
  for select to authenticated using (true);
create policy "job_listings: authenticated read" on public.job_listings
  for select to authenticated using (true);
-- question_bank: no client policies (service role only).

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------
create policy "resumes: read own" on public.resumes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "resumes: delete own" on public.resumes
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "resumes: update own" on public.resumes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant delete on public.resumes to authenticated;
grant update (is_primary) on public.resumes to authenticated;

create policy "resume_analyses: read own" on public.resume_analyses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "resume_analyses: delete own" on public.resume_analyses
  for delete to authenticated using (user_id = (select auth.uid()));
grant delete on public.resume_analyses to authenticated;

-- ---------------------------------------------------------------------------
-- Interviews (read own; pipeline writes via service role; users may delete sessions)
-- ---------------------------------------------------------------------------
create policy "interview_sessions: read own" on public.interview_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interview_sessions: delete own" on public.interview_sessions
  for delete to authenticated using (user_id = (select auth.uid()));
grant delete on public.interview_sessions to authenticated;

create policy "interview_questions: read own" on public.interview_questions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interview_responses: read own" on public.interview_responses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "answer_evaluations: read own" on public.answer_evaluations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interview_reports: read own" on public.interview_reports
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Learning plans
-- ---------------------------------------------------------------------------
create policy "learning_plans: read own" on public.learning_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "learning_plans: update own" on public.learning_plans
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "learning_plans: delete own" on public.learning_plans
  for delete to authenticated using (user_id = (select auth.uid()));
grant update (is_active) on public.learning_plans to authenticated;
grant delete on public.learning_plans to authenticated;

create policy "learning_plan_tasks: read own" on public.learning_plan_tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "learning_plan_tasks: update own" on public.learning_plan_tasks
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (completed_at) on public.learning_plan_tasks to authenticated;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create policy "chat_conversations: read own" on public.chat_conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_conversations: insert own" on public.chat_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "chat_conversations: update own" on public.chat_conversations
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "chat_conversations: delete own" on public.chat_conversations
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (user_id, title) on public.chat_conversations to authenticated;
grant update (title) on public.chat_conversations to authenticated;
grant delete on public.chat_conversations to authenticated;

create policy "chat_messages: read own" on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_messages: delete own" on public.chat_messages
  for delete to authenticated using (user_id = (select auth.uid()));
grant delete on public.chat_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Saved jobs
-- ---------------------------------------------------------------------------
create policy "saved_jobs: read own" on public.saved_jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "saved_jobs: insert own" on public.saved_jobs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "saved_jobs: delete own" on public.saved_jobs
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (user_id, company_id, job_role_id, job_listing_id, notes) on public.saved_jobs to authenticated;
grant delete on public.saved_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- Usage logs
-- ---------------------------------------------------------------------------
create policy "usage_logs: read own" on public.usage_logs
  for select to authenticated using (user_id = (select auth.uid()));

-- Tables created by future migrations must opt in explicitly.
alter default privileges in schema public revoke all on tables from anon;
