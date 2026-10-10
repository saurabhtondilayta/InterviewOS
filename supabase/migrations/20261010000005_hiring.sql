-- InterviewOS hiring platform: companies, HR users, assessments, invitations, AI proctoring.
--
-- Access model
--   * Students: see invitations only through the backend (which hides HR-only fields).
--   * Company members (org_members): read their organisation's assessments, invitations and
--     proctoring events. Proctoring results are NEVER readable by the candidate.
--   * All writes go through the backend (service role) after it checks membership/ownership.

-- ---------------------------------------------------------------------------
-- Account type on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_type text not null default 'student'
    check (account_type in ('student', 'recruiter')),
  add column if not exists designation text check (char_length(designation) <= 120);

grant update (designation) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Organisations (companies) and their members
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  website text check (website ~ '^https?://'),
  industry text check (char_length(industry) <= 120),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'recruiter' check (role in ('owner', 'admin', 'recruiter')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Assessments (a hiring interview round created by HR)
-- ---------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  role_title text not null check (char_length(role_title) between 2 and 120),
  job_role_id uuid references public.job_roles (id) on delete set null,
  description text check (char_length(description) <= 4000),
  mode text not null check (mode in ('ai', 'live')),
  interview_type public.interview_type not null default 'technical',
  experience_level public.experience_level not null default 'fresher',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  duration_minutes smallint not null default 20 check (duration_minutes between 5 and 120),
  topics text[] not null default '{}',
  proctoring_enabled boolean not null default true,
  show_results_to_candidate boolean not null default false,
  accepting_applications boolean not null default false,
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger assessments_updated_at before update on public.assessments
  for each row execute function public.set_updated_at();
create index assessments_org_idx on public.assessments (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Invitations: one candidate in one assessment (AI interview or live 1-on-1)
-- ---------------------------------------------------------------------------
create table public.assessment_invitations (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  candidate_email citext not null,
  candidate_user_id uuid references public.profiles (id) on delete set null,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  consent_at timestamptz,
  share_resume boolean not null default false,
  session_id uuid references public.interview_sessions (id) on delete set null,
  room_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  live_started_at timestamptz,
  live_ended_at timestamptz,
  integrity_score numeric(5, 1) check (integrity_score between 0 and 100),
  proctoring_summary jsonb not null default '{}'::jsonb,
  hr_feedback jsonb not null default '{}'::jsonb,
  decision text not null default 'pending' check (decision in ('pending', 'shortlisted', 'rejected', 'hired')),
  hr_notes text check (char_length(hr_notes) <= 8000),
  invited_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, candidate_email)
);
create trigger assessment_invitations_updated_at before update on public.assessment_invitations
  for each row execute function public.set_updated_at();
create index assessment_invitations_org_idx on public.assessment_invitations (org_id, created_at desc);
create index assessment_invitations_candidate_idx on public.assessment_invitations (candidate_user_id);
create index assessment_invitations_email_idx on public.assessment_invitations (candidate_email);

-- Interview sessions taken as part of an assessment
alter table public.interview_sessions
  add column if not exists assessment_invitation_id uuid references public.assessment_invitations (id) on delete set null,
  add column if not exists results_hidden boolean not null default false;

-- ---------------------------------------------------------------------------
-- Proctoring events (computed in the candidate's browser; visible to the company only)
-- ---------------------------------------------------------------------------
create table public.proctoring_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.assessment_invitations (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  candidate_user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in (
    'session_start', 'session_end', 'no_face', 'multiple_faces', 'looking_away', 'phone_detected',
    'tab_hidden', 'window_blur', 'fullscreen_exit', 'copy_paste', 'camera_off'
  )),
  severity smallint not null check (severity between 0 and 3),
  detail jsonb not null default '{}'::jsonb,
  snapshot_path text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index proctoring_events_invitation_idx on public.proctoring_events (invitation_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Profile creation: account type, and a company for HR sign-ups
-- ---------------------------------------------------------------------------
create or replace function public.handle_verified_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  kind text := case when meta ->> 'account_type' = 'recruiter' then 'recruiter' else 'student' end;
  new_org uuid;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.profiles (
    id, email, full_name, account_type, designation, college, degree, branch, current_year, graduation_year,
    preferred_role, years_experience, target_roles, onboarding_completed
  ) values (
    new.id,
    new.email,
    coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    kind,
    nullif(trim(meta ->> 'designation'), ''),
    nullif(trim(meta ->> 'college'), ''),
    nullif(trim(meta ->> 'degree'), ''),
    nullif(trim(meta ->> 'branch'), ''),
    case when (meta ->> 'current_year') ~ '^[1-6]$' then (meta ->> 'current_year')::smallint end,
    case when (meta ->> 'graduation_year') ~ '^\d{4}$' then (meta ->> 'graduation_year')::smallint end,
    nullif(trim(meta ->> 'preferred_role'), ''),
    case when (meta ->> 'years_experience') ~ '^\d{1,2}(\.\d)?$'
         then least((meta ->> 'years_experience')::numeric, 50) else 0 end,
    case when nullif(trim(meta ->> 'preferred_role'), '') is not null
         then array[trim(meta ->> 'preferred_role')] else '{}' end,
    kind = 'recruiter'  -- recruiters skip the student onboarding
  );

  if kind = 'recruiter' and char_length(trim(coalesce(meta ->> 'company_name', ''))) >= 2 then
    insert into public.organizations (name, website, created_by)
    values (
      left(trim(meta ->> 'company_name'), 160),
      case when (meta ->> 'company_website') ~ '^https?://' then meta ->> 'company_website' end,
      new.id
    )
    returning id into new_org;
    insert into public.org_members (org_id, user_id, role) values (new_org, new.id, 'owner');
  end if;

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
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_invitations enable row level security;
alter table public.proctoring_events enable row level security;

revoke all on public.organizations, public.org_members, public.assessments,
              public.assessment_invitations, public.proctoring_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.organizations, public.org_members,
       public.assessments, public.assessment_invitations, public.proctoring_events from authenticated;
grant select on public.organizations, public.org_members, public.assessments,
             public.assessment_invitations, public.proctoring_events to authenticated;

create policy "organizations: members read" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "org_members: members read" on public.org_members
  for select to authenticated using (public.is_org_member(org_id));
create policy "assessments: members read" on public.assessments
  for select to authenticated using (public.is_org_member(org_id));
-- Candidates never read invitations directly (HR notes, decisions and integrity scores live here).
create policy "assessment_invitations: members read" on public.assessment_invitations
  for select to authenticated using (public.is_org_member(org_id));
-- Proctoring results: company members only, never the candidate.
create policy "proctoring_events: members read" on public.proctoring_events
  for select to authenticated using (public.is_org_member(org_id));

-- Hide scores of company assessments from the candidate when the company chose so.
drop policy if exists "answer_evaluations: read own" on public.answer_evaluations;
create policy "answer_evaluations: read own" on public.answer_evaluations
  for select to authenticated using (
    user_id = (select auth.uid())
    and not exists (select 1 from public.interview_sessions s where s.id = session_id and s.results_hidden)
  );
drop policy if exists "interview_reports: read own" on public.interview_reports;
create policy "interview_reports: read own" on public.interview_reports
  for select to authenticated using (
    user_id = (select auth.uid())
    and not exists (select 1 from public.interview_sessions s where s.id = session_id and s.results_hidden)
  );

-- ---------------------------------------------------------------------------
-- Private bucket for proctoring snapshots (backend/service role only; no client policies)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proctoring', 'proctoring', false, 204800, array['image/jpeg'])
on conflict (id) do update set public = false;
