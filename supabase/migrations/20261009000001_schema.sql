-- InterviewOS core schema
-- Run in order with the other migrations in this folder (Supabase SQL editor or `supabase db push`).
-- Passwords and OTP codes are handled exclusively by Supabase Auth (auth.users); no custom
-- table in this schema stores credentials.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.interview_type as enum (
  'hr', 'technical', 'resume', 'coding', 'behavioral', 'system_design', 'company', 'full'
);
create type public.experience_level as enum ('fresher', 'junior', 'mid', 'senior');
create type public.session_status as enum ('configured', 'in_progress', 'completed', 'abandoned');
create type public.answer_mode as enum ('voice', 'text');
create type public.question_kind as enum ('technical', 'behavioral', 'hr', 'coding', 'system_design', 'resume');
create type public.question_source as enum ('ai_generated', 'question_bank');
create type public.source_type as enum (
  'official_website', 'careers_page', 'job_listing', 'public_api', 'interview_guidance'
);
create type public.listing_status as enum ('active', 'stale', 'closed');
create type public.chat_role as enum ('user', 'assistant');

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
-- Users listed here may run company-data maintenance through the backend admin API.
-- Rows can only be added with the service role (SQL editor / backend), never by clients.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  college text check (char_length(college) <= 200),
  degree text check (char_length(degree) <= 120),
  branch text check (char_length(branch) <= 120),
  current_year smallint check (current_year between 1 and 6),
  graduation_year smallint check (graduation_year between 1990 and 2100),
  preferred_role text check (char_length(preferred_role) <= 120),
  years_experience numeric(4, 1) not null default 0 check (years_experience between 0 and 50),
  current_education text check (char_length(current_education) <= 300),
  programming_languages text[] not null default '{}',
  projects jsonb not null default '[]'::jsonb check (jsonb_typeof(projects) = 'array'),
  internships jsonb not null default '[]'::jsonb check (jsonb_typeof(internships) = 'array'),
  certifications jsonb not null default '[]'::jsonb check (jsonb_typeof(certifications) = 'array'),
  preferred_companies text[] not null default '{}',
  target_roles text[] not null default '{}',
  interview_experience text check (char_length(interview_experience) <= 2000),
  improvement_areas text[] not null default '{}',
  weekly_study_hours smallint check (weekly_study_hours between 1 and 80),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile only once the email address has been verified via OTP.
-- Registration details are passed as user metadata in supabase.auth.signUp().
create or replace function public.handle_verified_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.profiles (
    id, email, full_name, college, degree, branch, current_year, graduation_year,
    preferred_role, years_experience, target_roles
  ) values (
    new.id,
    new.email,
    coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta ->> 'college'), ''),
    nullif(trim(meta ->> 'degree'), ''),
    nullif(trim(meta ->> 'branch'), ''),
    case when (meta ->> 'current_year') ~ '^[1-6]$' then (meta ->> 'current_year')::smallint end,
    case when (meta ->> 'graduation_year') ~ '^\d{4}$' then (meta ->> 'graduation_year')::smallint end,
    nullif(trim(meta ->> 'preferred_role'), ''),
    case when (meta ->> 'years_experience') ~ '^\d{1,2}(\.\d)?$'
         then least((meta ->> 'years_experience')::numeric, 50) else 0 end,
    case when nullif(trim(meta ->> 'preferred_role'), '') is not null
         then array[trim(meta ->> 'preferred_role')] else '{}' end
  );

  -- Skills entered at registration
  if jsonb_typeof(meta -> 'skills') = 'array' then
    insert into public.skills (name)
      select distinct trim(s) from jsonb_array_elements_text(meta -> 'skills') as s
      where char_length(trim(s)) between 1 and 60
    on conflict (name) do nothing;

    insert into public.user_skills (user_id, skill_id, source)
      select new.id, sk.id, 'profile'
      from public.skills sk
      where sk.name in (select trim(s)::citext from jsonb_array_elements_text(meta -> 'skills') as s)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Skills
-- ---------------------------------------------------------------------------
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique check (char_length(name) between 1 and 60),
  category text,
  created_at timestamptz not null default now()
);

create table public.user_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  proficiency smallint check (proficiency between 1 and 5),
  source text not null default 'profile' check (source in ('profile', 'resume', 'interview')),
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
create index user_skills_skill_idx on public.user_skills (skill_id);

-- The auth trigger is created after skills/user_skills exist because the function references them.
create trigger on_auth_user_verified
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_verified_user();

-- ---------------------------------------------------------------------------
-- Companies, roles and job listings (public reference data, admin-maintained)
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  official_website text not null check (official_website ~ '^https://'),
  careers_url text check (careers_url ~ '^https://'),
  description text,
  industry text,
  headquarters text,
  -- Optional connector to an official public job-board API ('greenhouse' | 'lever' | null)
  job_board_provider text check (job_board_provider in ('greenhouse', 'lever')),
  job_board_token text,
  is_active boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create index companies_name_lower_idx on public.companies (lower(name));

create table public.company_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source_type public.source_type not null,
  url text not null check (url ~ '^https://'),
  title text,
  notes text,
  robots_allowed boolean,
  last_status_code smallint,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, url)
);
create index company_sources_company_idx on public.company_sources (company_id);

-- General, role-based competency frameworks. These describe what a role typically
-- requires across the industry; they are NOT claims about any specific company.
create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  family text not null,
  description text not null,
  -- [{ "topic": "Data Structures & Algorithms", "weight": 0.25, "kind": "technical" }, ...]
  competencies jsonb not null check (jsonb_typeof(competencies) = 'array'),
  typical_skills text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.job_listings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_role_id uuid references public.job_roles (id) on delete set null,
  source_id uuid references public.company_sources (id) on delete set null,
  external_id text,
  title text not null,
  location text,
  employment_type text,
  experience_min numeric(4, 1),
  experience_max numeric(4, 1),
  description_text text,
  required_skills text[] not null default '{}',
  source_url text not null check (source_url ~ '^https://'),
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_url)
);
create trigger job_listings_updated_at before update on public.job_listings
  for each row execute function public.set_updated_at();
create index job_listings_company_idx on public.job_listings (company_id, status);
create index job_listings_role_idx on public.job_listings (job_role_id);

-- Curated, verified question records (original questions written by admins).
create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  job_role_id uuid references public.job_roles (id) on delete set null,
  topic text not null,
  kind public.question_kind not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  question_text text not null,
  expected_points text[] not null default '{}',
  source_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index question_bank_lookup_idx on public.question_bank (topic, kind, difficulty) where is_active;

-- ---------------------------------------------------------------------------
-- Resumes
-- ---------------------------------------------------------------------------
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) <= 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  extracted_text text,
  page_count smallint,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index resumes_user_idx on public.resumes (user_id, created_at desc);
create unique index resumes_one_primary_idx on public.resumes (user_id) where is_primary;

create table public.resume_analyses (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_role text not null,
  job_listing_id uuid references public.job_listings (id) on delete set null,
  job_description_text text,
  model text not null,
  prompt_version text not null,
  overall_score numeric(5, 1) check (overall_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index resume_analyses_user_idx on public.resume_analyses (user_id, created_at desc);
create index resume_analyses_resume_idx on public.resume_analyses (resume_id);

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  job_role_id uuid references public.job_roles (id) on delete set null,
  job_listing_id uuid references public.job_listings (id) on delete set null,
  resume_id uuid references public.resumes (id) on delete set null,
  role_title text not null,
  interview_type public.interview_type not null,
  experience_level public.experience_level not null,
  start_difficulty smallint not null check (start_difficulty between 1 and 5),
  current_difficulty smallint not null check (current_difficulty between 1 and 5),
  duration_minutes smallint not null check (duration_minutes between 5 and 120),
  target_question_count smallint not null check (target_question_count between 1 and 30),
  topics text[] not null default '{}',
  answer_mode public.answer_mode not null default 'text',
  is_company_specific boolean not null default false,
  is_practice boolean not null default false,
  rubric_version text not null,
  -- Explainable plan: competencies, weights, and per-topic mastery state.
  plan jsonb not null default '{}'::jsonb,
  status public.session_status not null default 'configured',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index interview_sessions_user_idx on public.interview_sessions (user_id, created_at desc);

create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sequence_no smallint not null,
  parent_question_id uuid references public.interview_questions (id) on delete cascade,
  topic text not null,
  kind public.question_kind not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  question_text text not null,
  expected_points text[] not null default '{}',
  -- Optional structured details (e.g. coding constraints, examples, starter signature)
  details jsonb not null default '{}'::jsonb,
  source public.question_source not null,
  question_bank_id uuid references public.question_bank (id) on delete set null,
  selection_reason text not null,
  asked_at timestamptz not null default now(),
  unique (session_id, sequence_no)
);
create index interview_questions_session_idx on public.interview_questions (session_id, sequence_no);
create index interview_questions_user_idx on public.interview_questions (user_id);

create table public.interview_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.interview_questions (id) on delete cascade,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer_text text not null check (char_length(answer_text) <= 20000),
  code_language text,
  answer_mode public.answer_mode not null,
  duration_seconds integer check (duration_seconds >= 0),
  submitted_at timestamptz not null default now()
);
create index interview_responses_session_idx on public.interview_responses (session_id);
create index interview_responses_user_idx on public.interview_responses (user_id);

create table public.answer_evaluations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.interview_responses (id) on delete cascade,
  question_id uuid not null references public.interview_questions (id) on delete cascade,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rubric_version text not null,
  -- General dimensions 0-10: relevance, correctness, depth, communication, problem_solving
  dimension_scores jsonb not null,
  -- Separate technical track for coding / system design (null otherwise)
  technical_track text check (technical_track in ('coding', 'system_design')),
  technical_scores jsonb,
  question_score numeric(4, 1) not null check (question_score between 0 and 10),
  communication_score numeric(4, 1) check (communication_score between 0 and 10),
  feedback text not null,
  strengths text[] not null default '{}',
  missing_concepts text[] not null default '{}',
  incorrect_statements text[] not null default '{}',
  model_answer_outline text[] not null default '{}',
  dimension_rationale text,
  needs_follow_up boolean not null default false,
  follow_up_reason text,
  difficulty_before smallint not null check (difficulty_before between 1 and 5),
  difficulty_after smallint not null check (difficulty_after between 1 and 5),
  adjustment_reason text not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index answer_evaluations_session_idx on public.answer_evaluations (session_id);
create index answer_evaluations_user_idx on public.answer_evaluations (user_id, created_at desc);

create table public.interview_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.interview_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rubric_version text not null,
  interview_type public.interview_type not null,
  overall_score numeric(4, 1) check (overall_score between 0 and 10),
  dimension_averages jsonb not null,
  technical_averages jsonb,
  topic_scores jsonb not null,
  summary jsonb not null,
  suggested_next_difficulty smallint check (suggested_next_difficulty between 1 and 5),
  model text not null,
  created_at timestamptz not null default now()
);
create index interview_reports_user_idx on public.interview_reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Learning plans
-- ---------------------------------------------------------------------------
create table public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  duration_days smallint not null check (duration_days in (7, 30)),
  daily_minutes smallint not null check (daily_minutes between 15 and 600),
  goals text,
  inputs jsonb not null default '{}'::jsonb,
  overview text,
  is_active boolean not null default true,
  start_date date not null default current_date,
  model text not null,
  created_at timestamptz not null default now()
);
create index learning_plans_user_idx on public.learning_plans (user_id, created_at desc);

create table public.learning_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 30),
  sort_order smallint not null default 0,
  title text not null,
  description text,
  topic text,
  task_type text not null check (task_type in ('study', 'practice', 'mock_interview', 'resume', 'project', 'revision')),
  estimated_minutes smallint check (estimated_minutes between 5 and 600),
  completed_at timestamptz
);
create index learning_plan_tasks_plan_idx on public.learning_plan_tasks (plan_id, day_number, sort_order);
create index learning_plan_tasks_user_idx on public.learning_plan_tasks (user_id);

-- ---------------------------------------------------------------------------
-- Career coach chat
-- ---------------------------------------------------------------------------
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger chat_conversations_updated_at before update on public.chat_conversations
  for each row execute function public.set_updated_at();
create index chat_conversations_user_idx on public.chat_conversations (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.chat_role not null,
  content text not null check (char_length(content) <= 20000),
  citations jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Saved jobs / targets
-- ---------------------------------------------------------------------------
create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  job_role_id uuid references public.job_roles (id) on delete cascade,
  job_listing_id uuid references public.job_listings (id) on delete cascade,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  check (company_id is not null or job_role_id is not null or job_listing_id is not null)
);
create unique index saved_jobs_unique_idx on public.saved_jobs (
  user_id,
  coalesce(company_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(job_role_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(job_listing_id, '00000000-0000-0000-0000-000000000000')
);

-- ---------------------------------------------------------------------------
-- AI usage logs (no prompts, resume text, or secrets are stored here)
-- ---------------------------------------------------------------------------
create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  feature text not null,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  status text not null check (status in ('ok', 'error', 'rate_limited')),
  error_code text,
  created_at timestamptz not null default now()
);
create index usage_logs_user_feature_idx on public.usage_logs (user_id, feature, created_at desc);
