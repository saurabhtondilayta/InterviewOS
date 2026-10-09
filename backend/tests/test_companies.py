import httpx
import pytest
import respx

from app.services import companies as c


@pytest.mark.parametrize(
    ("title", "slug"),
    [
        ("Software Development Engineer I", "software-engineer"),
        ("Frontend Engineer (React)", "frontend-developer"),
        ("Senior Site Reliability Engineer", "devops-engineer"),
        ("Graduate Engineer Trainee 2027", "graduate-engineer-trainee"),
        ("Cloud Support Associate", "cloud-engineer"),
        ("Data Analyst - Marketing", "data-analyst"),
        ("Machine Learning Engineer", "machine-learning-engineer"),
        ("Office Manager", None),
    ],
)
def test_match_role_slug(title, slug):
    assert c.match_role_slug(title) == slug


def test_extract_skills_uses_word_boundaries():
    text = "Experience with Java, Spring Boot, AWS and Kubernetes. JavaScript is a plus."
    skills = c.extract_skills(text)
    assert {"Java", "AWS", "Kubernetes", "JavaScript", "Spring"} <= set(skills)
    assert "Go" not in skills


def test_parse_experience():
    assert c.parse_experience("Requires 2-4 years of experience") == (2.0, 4.0)
    assert c.parse_experience("3+ years in backend") == (3.0, None)
    assert c.parse_experience("Freshers welcome") == (None, None)


def test_html_to_text():
    raw = "&lt;p&gt;Hello&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;"
    assert c.html_to_text(raw) == "Hello\n- Python"


@respx.mock
def test_robots_disallow_is_respected():
    respx.get("https://careers.example.com/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow: /jobs/"))
    with httpx.Client() as client:
        assert c.robots_allows("https://careers.example.com/jobs/123", client) is False
        assert c.robots_allows("https://careers.example.com/about", client) is True


@respx.mock
def test_robots_unreadable_is_conservative():
    respx.get("https://x.example.com/robots.txt").mock(return_value=httpx.Response(403))
    with httpx.Client() as client:
        assert c.robots_allows("https://x.example.com/jobs/1", client) is False
