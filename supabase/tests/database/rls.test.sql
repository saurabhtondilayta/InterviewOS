-- Row Level Security tests (pgTAP). Run with:  supabase test db
-- They create two users, insert data as the service role, then act as each user via the
-- `authenticated` role + JWT claims and assert what each can see and change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures (as table owner / service role)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@test.local', '{"full_name":"Alice A","skills":["Python","SQL"],"preferred_role":"Software Engineer"}', now(), 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@test.local', '{"full_name":"Bob B"}', null, 'authenticated', 'authenticated');

-- Profile is created only for the verified user
select is((select count(*) from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001')::int, 1, 'verified user gets a profile');
select is((select count(*) from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002')::int, 0, 'unverified user has no profile yet');
select is((select count(*) from public.user_skills where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int, 2, 'registration skills are stored');

-- Verify Bob -> profile created by trigger
update auth.users set email_confirmed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is((select count(*) from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002')::int, 1, 'profile created on email verification');

insert into public.resumes (id, user_id, storage_path, original_filename, mime_type, size_bytes, extracted_text)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/x.pdf', 'alice.pdf', 'application/pdf', 1000, 'alice resume');

insert into public.interview_sessions (id, user_id, role_title, interview_type, experience_level, start_difficulty, current_difficulty, duration_minutes, target_question_count, rubric_version)
values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'SDE', 'technical', 'fresher', 3, 3, 30, 6, 'v1');

insert into public.chat_conversations (id, user_id, title)
values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice chat');

-- ---------------------------------------------------------------------------
-- Act as Bob
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';

select is((select count(*) from public.profiles)::int, 1, 'Bob sees only his own profile');
select is((select count(*) from public.resumes)::int, 0, 'Bob cannot see Alice''s resumes');
select is((select count(*) from public.interview_sessions)::int, 0, 'Bob cannot see Alice''s interviews');
select is((select count(*) from public.chat_conversations)::int, 0, 'Bob cannot see Alice''s conversations');
select is((select count(*) from public.user_skills)::int, 0, 'Bob cannot see Alice''s skills');

update public.profiles set full_name = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.resumes where id = 'cccccccc-0000-0000-0000-000000000001';
delete from public.interview_sessions where id = 'dddddddd-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into public.chat_conversations (user_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'spoof') $$,
  '42501', null, 'Bob cannot create a conversation owned by Alice'
);
select throws_ok(
  $$ insert into public.answer_evaluations (response_id, question_id, session_id, user_id, rubric_version, dimension_scores, question_score, feedback, difficulty_before, difficulty_after, adjustment_reason, model)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'v1', '{}', 10, 'x', 1, 1, 'x', 'x') $$,
  '42501', null, 'users cannot write their own evaluation scores'
);
select throws_ok(
  $$ insert into public.usage_logs (user_id, feature, status) values ('bbbbbbbb-0000-0000-0000-000000000002', 'x', 'ok') $$,
  '42501', null, 'users cannot write usage logs'
);
select throws_ok(
  $$ update public.profiles set email = 'new@x.com' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  '42501', null, 'users cannot change their email column directly'
);
select throws_ok(
  $$ insert into public.companies (name, slug, official_website) values ('Fake', 'fake', 'https://fake.example') $$,
  '42501', null, 'users cannot create companies'
);
select throws_ok($$ select * from public.question_bank $$, '42501', null, 'question bank is not readable by clients');
select throws_ok($$ insert into public.admin_users (user_id) values ('bbbbbbbb-0000-0000-0000-000000000002') $$, '42501', null, 'users cannot make themselves admin');

select ok((select count(*) from public.companies) > 0, 'authenticated users can read companies');
select ok((select count(*) from public.job_roles) > 0, 'authenticated users can read role frameworks');

update public.profiles set full_name = 'Bob Builder' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is((select full_name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'Bob Builder', 'Bob can update his own profile');

-- ---------------------------------------------------------------------------
-- Back to owner: Alice's data must be untouched
-- ---------------------------------------------------------------------------
reset role;
select is((select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Alice A', 'Alice''s profile was not modified by Bob');
select is((select count(*) from public.resumes where id = 'cccccccc-0000-0000-0000-000000000001')::int, 1, 'Alice''s resume was not deleted by Bob');
select is((select count(*) from public.interview_sessions where id = 'dddddddd-0000-0000-0000-000000000001')::int, 1, 'Alice''s session was not deleted by Bob');

-- ---------------------------------------------------------------------------
-- Act as Alice
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*) from public.resumes)::int, 1, 'Alice sees her resume');
select is((select count(*) from public.chat_conversations)::int, 1, 'Alice sees her conversation');

-- anon has no access at all
reset role;
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');

reset role;
select * from finish();
rollback;
