-- Reference data: initial target companies and general role competency frameworks.
--
-- Companies: only the company name, official website and official careers URL are seeded.
-- careers URLs were checked on 2026-10-09; entries whose page could not be fetched
-- automatically (bot protection / timeout) are left with last_verified_at = NULL so the UI
-- labels them "not yet verified". No job listings, interview processes, or questions are
-- seeded: those must come from official sources via the admin import workflow
-- (see docs/COMPANY_DATA.md).

insert into public.companies (name, slug, official_website, careers_url, industry, last_verified_at)
values
  ('Google', 'google', 'https://www.google.com', 'https://www.google.com/about/careers/applications/', 'Technology', '2026-10-09'),
  ('Microsoft', 'microsoft', 'https://www.microsoft.com', 'https://careers.microsoft.com/', 'Technology', '2026-10-09'),
  ('Amazon', 'amazon', 'https://www.amazon.com', 'https://www.amazon.jobs/', 'Technology / E-commerce', '2026-10-09'),
  ('Accenture', 'accenture', 'https://www.accenture.com', 'https://www.accenture.com/in-en/careers', 'IT Services & Consulting', '2026-10-09'),
  ('Wipro', 'wipro', 'https://www.wipro.com', 'https://careers.wipro.com/', 'IT Services & Consulting', '2026-10-09'),
  ('Cognizant', 'cognizant', 'https://www.cognizant.com', 'https://careers.cognizant.com/', 'IT Services & Consulting', '2026-10-09'),
  ('Infosys', 'infosys', 'https://www.infosys.com', 'https://www.infosys.com/careers.html', 'IT Services & Consulting', null),
  ('Tata Consultancy Services', 'tcs', 'https://www.tcs.com', 'https://www.tcs.com/careers', 'IT Services & Consulting', null),
  ('HCLTech', 'hcltech', 'https://www.hcltech.com', 'https://www.hcltech.com/careers', 'IT Services & Consulting', null)
on conflict (slug) do nothing;

insert into public.company_sources (company_id, source_type, url, title, last_checked_at, last_status_code, notes)
select c.id, 'careers_page', c.careers_url, c.name || ' careers (official)',
       c.last_verified_at,
       case when c.last_verified_at is not null then 200 end,
       case when c.last_verified_at is null
            then 'Automated check blocked or timed out on 2026-10-09; verify manually.' end
from public.companies c
where c.careers_url is not null
on conflict (company_id, url) do nothing;

insert into public.company_sources (company_id, source_type, url, title)
select c.id, 'official_website', c.official_website, c.name || ' official website'
from public.companies c
on conflict (company_id, url) do nothing;

-- General role competency frameworks (industry-wide, not company-specific).
-- weight values in each framework sum to 1.0. kind maps to question_kind.
insert into public.job_roles (title, slug, family, description, competencies, typical_skills) values
(
  'Software Engineer', 'software-engineer', 'Engineering',
  'Designs, builds and maintains software systems. Campus roles typically emphasise problem solving, CS fundamentals and clean code.',
  '[
    {"topic": "Data Structures & Algorithms", "weight": 0.25, "kind": "coding"},
    {"topic": "Object-Oriented Programming", "weight": 0.12, "kind": "technical"},
    {"topic": "Database Management Systems", "weight": 0.10, "kind": "technical"},
    {"topic": "Operating Systems", "weight": 0.08, "kind": "technical"},
    {"topic": "Computer Networks", "weight": 0.07, "kind": "technical"},
    {"topic": "System Design Basics", "weight": 0.10, "kind": "system_design"},
    {"topic": "Projects & Experience", "weight": 0.13, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.10, "kind": "behavioral"},
    {"topic": "HR & Motivation", "weight": 0.05, "kind": "hr"}
  ]'::jsonb,
  array['Data Structures', 'Algorithms', 'Java', 'Python', 'C++', 'SQL', 'Git', 'OOP']
),
(
  'Frontend Developer', 'frontend-developer', 'Engineering',
  'Builds user interfaces for web applications with attention to performance, accessibility and maintainability.',
  '[
    {"topic": "JavaScript & TypeScript", "weight": 0.22, "kind": "technical"},
    {"topic": "React & Component Architecture", "weight": 0.18, "kind": "technical"},
    {"topic": "HTML, CSS & Accessibility", "weight": 0.12, "kind": "technical"},
    {"topic": "Browser & Web Performance", "weight": 0.10, "kind": "technical"},
    {"topic": "Data Structures & Algorithms", "weight": 0.12, "kind": "coding"},
    {"topic": "Projects & Experience", "weight": 0.14, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.12, "kind": "behavioral"}
  ]'::jsonb,
  array['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'REST APIs', 'Git']
),
(
  'Backend Developer', 'backend-developer', 'Engineering',
  'Builds server-side services, APIs and data layers that are reliable, secure and scalable.',
  '[
    {"topic": "API Design & HTTP", "weight": 0.15, "kind": "technical"},
    {"topic": "Database Management Systems", "weight": 0.17, "kind": "technical"},
    {"topic": "Data Structures & Algorithms", "weight": 0.15, "kind": "coding"},
    {"topic": "System Design Basics", "weight": 0.15, "kind": "system_design"},
    {"topic": "Operating Systems & Concurrency", "weight": 0.08, "kind": "technical"},
    {"topic": "Security Fundamentals", "weight": 0.06, "kind": "technical"},
    {"topic": "Projects & Experience", "weight": 0.14, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.10, "kind": "behavioral"}
  ]'::jsonb,
  array['Java', 'Python', 'Node.js', 'SQL', 'REST APIs', 'Docker', 'Git']
),
(
  'Full Stack Developer', 'full-stack-developer', 'Engineering',
  'Works across frontend, backend and data layers to deliver complete product features.',
  '[
    {"topic": "JavaScript & TypeScript", "weight": 0.15, "kind": "technical"},
    {"topic": "React & Component Architecture", "weight": 0.12, "kind": "technical"},
    {"topic": "API Design & HTTP", "weight": 0.13, "kind": "technical"},
    {"topic": "Database Management Systems", "weight": 0.13, "kind": "technical"},
    {"topic": "Data Structures & Algorithms", "weight": 0.13, "kind": "coding"},
    {"topic": "System Design Basics", "weight": 0.10, "kind": "system_design"},
    {"topic": "Projects & Experience", "weight": 0.14, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.10, "kind": "behavioral"}
  ]'::jsonb,
  array['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'REST APIs', 'Git']
),
(
  'Cloud Engineer', 'cloud-engineer', 'Cloud & Infrastructure',
  'Designs, deploys and operates workloads on public cloud platforms with a focus on reliability, security and cost.',
  '[
    {"topic": "Cloud Fundamentals (Compute, Storage, IAM)", "weight": 0.20, "kind": "technical"},
    {"topic": "Computer Networks", "weight": 0.14, "kind": "technical"},
    {"topic": "Linux & Operating Systems", "weight": 0.12, "kind": "technical"},
    {"topic": "Containers & Orchestration", "weight": 0.12, "kind": "technical"},
    {"topic": "Infrastructure as Code & CI/CD", "weight": 0.10, "kind": "technical"},
    {"topic": "Cloud Architecture & Scalability", "weight": 0.10, "kind": "system_design"},
    {"topic": "Projects & Experience", "weight": 0.12, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.10, "kind": "behavioral"}
  ]'::jsonb,
  array['AWS', 'Azure', 'Google Cloud', 'Linux', 'Docker', 'Kubernetes', 'Terraform', 'Networking']
),
(
  'DevOps Engineer', 'devops-engineer', 'Cloud & Infrastructure',
  'Automates build, release and operations workflows and improves system reliability.',
  '[
    {"topic": "Linux & Operating Systems", "weight": 0.15, "kind": "technical"},
    {"topic": "Infrastructure as Code & CI/CD", "weight": 0.20, "kind": "technical"},
    {"topic": "Containers & Orchestration", "weight": 0.17, "kind": "technical"},
    {"topic": "Monitoring & Incident Response", "weight": 0.10, "kind": "technical"},
    {"topic": "Scripting & Automation", "weight": 0.12, "kind": "coding"},
    {"topic": "Projects & Experience", "weight": 0.14, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.12, "kind": "behavioral"}
  ]'::jsonb,
  array['Linux', 'Bash', 'Python', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'GitHub Actions']
),
(
  'Data Analyst', 'data-analyst', 'Data',
  'Turns data into decisions through querying, analysis, visualisation and clear communication.',
  '[
    {"topic": "SQL & Data Querying", "weight": 0.25, "kind": "technical"},
    {"topic": "Statistics & Probability", "weight": 0.18, "kind": "technical"},
    {"topic": "Excel, Python & Data Wrangling", "weight": 0.15, "kind": "technical"},
    {"topic": "Data Visualisation & Storytelling", "weight": 0.12, "kind": "technical"},
    {"topic": "Projects & Experience", "weight": 0.15, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.10, "kind": "behavioral"},
    {"topic": "HR & Motivation", "weight": 0.05, "kind": "hr"}
  ]'::jsonb,
  array['SQL', 'Excel', 'Python', 'Pandas', 'Power BI', 'Tableau', 'Statistics']
),
(
  'Machine Learning Engineer', 'machine-learning-engineer', 'Data',
  'Builds, evaluates and deploys machine learning models in production systems.',
  '[
    {"topic": "Machine Learning Fundamentals", "weight": 0.22, "kind": "technical"},
    {"topic": "Statistics & Probability", "weight": 0.12, "kind": "technical"},
    {"topic": "Deep Learning", "weight": 0.12, "kind": "technical"},
    {"topic": "Data Structures & Algorithms", "weight": 0.14, "kind": "coding"},
    {"topic": "ML System Design", "weight": 0.12, "kind": "system_design"},
    {"topic": "Projects & Experience", "weight": 0.16, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.12, "kind": "behavioral"}
  ]'::jsonb,
  array['Python', 'NumPy', 'Pandas', 'scikit-learn', 'PyTorch', 'TensorFlow', 'SQL']
),
(
  'Cybersecurity Analyst', 'cybersecurity-analyst', 'Security',
  'Protects systems and data by monitoring threats, analysing incidents and hardening infrastructure.',
  '[
    {"topic": "Security Fundamentals", "weight": 0.22, "kind": "technical"},
    {"topic": "Computer Networks", "weight": 0.18, "kind": "technical"},
    {"topic": "Linux & Operating Systems", "weight": 0.14, "kind": "technical"},
    {"topic": "Threats, Vulnerabilities & Incident Response", "weight": 0.16, "kind": "technical"},
    {"topic": "Projects & Experience", "weight": 0.15, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.15, "kind": "behavioral"}
  ]'::jsonb,
  array['Networking', 'Linux', 'Wireshark', 'SIEM', 'Python', 'OWASP Top 10']
),
(
  'QA / Test Engineer', 'qa-test-engineer', 'Engineering',
  'Ensures software quality through test planning, manual and automated testing, and defect analysis.',
  '[
    {"topic": "Software Testing Fundamentals", "weight": 0.25, "kind": "technical"},
    {"topic": "Test Automation", "weight": 0.20, "kind": "technical"},
    {"topic": "Programming Basics", "weight": 0.15, "kind": "coding"},
    {"topic": "Database Management Systems", "weight": 0.08, "kind": "technical"},
    {"topic": "Projects & Experience", "weight": 0.17, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.15, "kind": "behavioral"}
  ]'::jsonb,
  array['Manual Testing', 'Selenium', 'Java', 'Python', 'SQL', 'API Testing']
),
(
  'Graduate Engineer Trainee', 'graduate-engineer-trainee', 'Engineering',
  'Entry-level engineering track common in IT services campus hiring: aptitude for programming, CS fundamentals and communication.',
  '[
    {"topic": "Programming Basics", "weight": 0.20, "kind": "coding"},
    {"topic": "Object-Oriented Programming", "weight": 0.12, "kind": "technical"},
    {"topic": "Database Management Systems", "weight": 0.12, "kind": "technical"},
    {"topic": "Operating Systems", "weight": 0.08, "kind": "technical"},
    {"topic": "Computer Networks", "weight": 0.08, "kind": "technical"},
    {"topic": "Projects & Experience", "weight": 0.15, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.12, "kind": "behavioral"},
    {"topic": "HR & Motivation", "weight": 0.13, "kind": "hr"}
  ]'::jsonb,
  array['C', 'Java', 'Python', 'SQL', 'OOP', 'Communication']
)
on conflict (slug) do nothing;
