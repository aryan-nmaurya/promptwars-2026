"""Bounded, read-only evidence collection for public GitHub repositories.

The collector deliberately uses GitHub's JSON API instead of cloning, downloading
archives, or executing repository code.  Repository contents are hostile input:
only a small, deterministic set of text files is fetched and returned to callers.

This module has no FastAPI, database, or settings dependencies.  An ``AsyncClient``
can be injected in tests (or by a dependency provider) without weakening the
hard-coded API origin used for every request.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import re
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote, urlsplit

import httpx

GITHUB_API_BASE = "https://api.github.com"

_OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
_REPOSITORY_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_OBJECT_SHA_RE = re.compile(r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")
_SAFE_REF_RE = re.compile(r"^[^\x00-\x20~^:?*\\\[\]]{1,255}$")

_MANIFESTS = {
    "build.gradle",
    "build.gradle.kts",
    "cargo.toml",
    "composer.json",
    "deno.json",
    "deno.jsonc",
    "gemfile",
    "go.mod",
    "package.json",
    "pom.xml",
    "pyproject.toml",
    "requirements.txt",
}
_DEPLOYMENT_FILES = {
    "cloudbuild.yaml",
    "docker-compose.yml",
    "docker-compose.yaml",
    "dockerfile",
    "fly.toml",
    "netlify.toml",
    "procfile",
    "render.yaml",
    "vercel.json",
}
_TEXT_FILENAMES = (
    _MANIFESTS
    | _DEPLOYMENT_FILES
    | {
        ".dockerignore",
        ".gitignore",
        "makefile",
        "nginx.conf",
    }
)
_LOCK_FILENAMES = {
    "bun.lock",
    "bun.lockb",
    "cargo.lock",
    "composer.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "poetry.lock",
    "yarn.lock",
}
_TEXT_SUFFIXES = {
    ".c",
    ".cc",
    ".cfg",
    ".conf",
    ".cpp",
    ".cs",
    ".css",
    ".csv",
    ".dart",
    ".go",
    ".gradle",
    ".graphql",
    ".h",
    ".hpp",
    ".html",
    ".ini",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".kts",
    ".md",
    ".mjs",
    ".php",
    ".properties",
    ".proto",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".vue",
    ".xml",
    ".yaml",
    ".yml",
}
#: Suffixes that carry an implementation, as opposed to text this collector
#: also reads (config, data, docs). Only these earn the architecture-layer
#: bonuses below: a `.gitignore` sitting in `api/` is not evidence of an API.
_SOURCE_SUFFIXES = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".dart",
    ".go",
    ".h",
    ".hpp",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".svelte",
    ".swift",
    ".ts",
    ".tsx",
    ".vue",
}
_VENDOR_SEGMENTS = {
    ".cache",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "bower_components",
    "build",
    "coverage",
    "dist",
    "generated",
    "node_modules",
    "out",
    "target",
    "vendor",
    "venv",
}
_SECRET_FILENAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".npmrc",
    ".pypirc",
    "credentials",
    "credentials.json",
    "id_dsa",
    "id_ed25519",
    "id_rsa",
    "secrets.json",
    "service-account.json",
}
_SECRET_SUFFIXES = {".der", ".jks", ".key", ".keystore", ".p12", ".pfx", ".pem"}
_STOP_WORDS = {
    "and",
    "app",
    "application",
    "build",
    "feature",
    "for",
    "from",
    "into",
    "project",
    "that",
    "the",
    "this",
    "using",
    "with",
}

# Common credential formats plus assignment-shaped secrets in otherwise safe
# source files.  Redaction is defense-in-depth; secret-like paths are never fetched.
_INLINE_SECRET_PATTERNS = (
    re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
)
_ASSIGNMENT_SECRET_RE = re.compile(
    r"(?im)(\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret)\b"
    r"\s*[:=]\s*)([\"']?)([^\s\"'#,;}]{8,})([\"']?)"
)
_PRIVATE_KEY_RE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
    re.DOTALL,
)


class GitHubError(RuntimeError):
    """Base exception for GitHub collection failures."""


class InvalidGitHubURL(ValueError, GitHubError):
    """The submitted URL is not a canonical public GitHub repository URL."""


class GitHubNotFound(GitHubError):
    """GitHub did not expose the requested public repository."""


class GitHubRateLimited(GitHubError):
    """GitHub refused the request because its API limit was reached."""

    def __init__(
        self, message: str, *, retry_after: str | None = None, authenticated: bool = False
    ) -> None:
        super().__init__(message)
        self.retry_after = retry_after
        # One collection spends up to 28 requests, and the unauthenticated
        # allowance is 60 per hour per originating IP - shared by every caller
        # on a serverless instance. Whether a server token was configured is
        # therefore the difference between a transient blip and a standing
        # misconfiguration, and the caller has to be able to tell them apart.
        self.authenticated = authenticated


class GitHubTimeout(GitHubError):
    """A per-request or whole-collection deadline expired."""


class GitHubProtocolError(GitHubError):
    """GitHub returned an unexpected or unsafe response."""


class GitHubRepositoryMoved(GitHubError):
    """The repository answered with a redirect, so it was renamed or transferred."""


class GitHubRepositoryRejected(GitHubError):
    """The repository is private or exceeds an explicit collection limit."""


@dataclass(frozen=True, slots=True)
class GitHubLimits:
    """All collection budgets, intentionally conservative for serverless use."""

    max_repository_kib: int = 50 * 1024
    max_tree_entries: int = 5_000
    max_files: int = 25
    max_file_bytes: int = 20 * 1024
    # An empty or near-empty file - a package marker, a one-line re-export -
    # costs a request and a slot while proving nothing about a planned feature.
    min_file_bytes: int = 64
    # Tests are worth reading, but they must not consume a budget meant for the
    # implementation; without a cap a well-tested repo spends most of its slots
    # proving only that it has tests.
    max_test_files: int = 5
    # Kept below the evaluator prompt cap so every fetched byte can actually be
    # presented to Gemini; coverage never claims that silently truncated files
    # were analyzed.
    max_total_bytes: int = 100 * 1024
    request_timeout_seconds: float = 5.0
    total_timeout_seconds: float = 8.0
    max_concurrency: int = 4
    max_metadata_response_bytes: int = 256 * 1024
    max_tree_response_bytes: int = 8 * 1024 * 1024

    def __post_init__(self) -> None:
        integer_limits = (
            self.max_repository_kib,
            self.max_tree_entries,
            self.max_files,
            self.max_file_bytes,
            self.max_total_bytes,
            self.max_concurrency,
            self.max_metadata_response_bytes,
            self.max_tree_response_bytes,
        )
        if any(value <= 0 for value in integer_limits):
            raise ValueError("GitHub limits must all be positive")
        if self.request_timeout_seconds <= 0 or self.total_timeout_seconds <= 0:
            raise ValueError("GitHub timeouts must be positive")
        if self.min_file_bytes < 0 or self.max_test_files < 0:
            raise ValueError("GitHub minimum file size and test cap must not be negative")

    # Both caps are read through these so that lowering one limit can never
    # contradict another's default: a caller who shrinks `max_file_bytes` for a
    # test should not also have to remember to shrink the floor beneath it.
    @property
    def effective_min_file_bytes(self) -> int:
        """The size floor, never above the ceiling it sits under."""

        return min(self.min_file_bytes, self.max_file_bytes)

    @property
    def effective_max_test_files(self) -> int:
        """The test-file cap, never above the total file budget."""

        return min(self.max_test_files, self.max_files)


@dataclass(frozen=True, slots=True)
class GitHubRepoRef:
    """Validated repository coordinates."""

    owner: str
    repository: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repository}"

    @property
    def canonical_url(self) -> str:
        return f"https://github.com/{self.full_name}"


@dataclass(frozen=True, slots=True)
class EvidenceFile:
    """One safe text file pinned by its Git object SHA."""

    path: str
    sha: str
    size_bytes: int
    relevance_score: int
    content: str


@dataclass(frozen=True, slots=True)
class RepositoryEvidence:
    """Commit-pinned evidence and honest analysis-coverage metadata."""

    repository: GitHubRepoRef
    default_branch: str
    commit_sha: str
    repository_size_kib: int
    tree_complete: bool
    tree_entries_reported: int
    tree_entries_processed: int
    files_considered: int
    bytes_analyzed: int
    files: tuple[EvidenceFile, ...]
    limitations: tuple[str, ...] = field(default_factory=tuple)

    @property
    def files_analyzed(self) -> int:
        return len(self.files)


@dataclass(frozen=True, slots=True)
class _Candidate:
    path: str
    sha: str
    declared_size: int
    score: int


def parse_github_repository_url(value: str) -> GitHubRepoRef:
    """Parse only ``https://github.com/owner/repository[.git][/ ]`` URLs.

    SCP syntax, API URLs, subdomains, credentials, ports, query strings, and
    fragments are rejected instead of being normalised into something usable.
    This keeps submitted input completely separate from the outbound API host.
    """

    if not isinstance(value, str) or value != value.strip() or not value:
        raise InvalidGitHubURL("Enter a canonical https://github.com/owner/repository URL")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise InvalidGitHubURL("The GitHub URL is malformed") from exc

    if parsed.scheme != "https" or parsed.netloc != "github.com":
        raise InvalidGitHubURL("Only canonical https://github.com repository URLs are allowed")
    if parsed.username is not None or parsed.password is not None or port is not None:
        raise InvalidGitHubURL("Credentials and ports are not allowed in GitHub URLs")
    if parsed.query or parsed.fragment:
        raise InvalidGitHubURL("GitHub repository URLs cannot contain a query or fragment")

    path = parsed.path
    if path.endswith("/"):
        path = path[:-1]
    parts = path.split("/")
    if len(parts) != 3 or parts[0] != "" or not parts[1] or not parts[2]:
        raise InvalidGitHubURL("The URL must identify exactly one owner and repository")

    owner, repository = parts[1], parts[2]
    if repository.endswith(".git"):
        repository = repository[:-4]
    if not _OWNER_RE.fullmatch(owner) or not _REPOSITORY_RE.fullmatch(repository):
        raise InvalidGitHubURL("The GitHub owner or repository name is invalid")
    if repository in {".", ".."} or repository.endswith("."):
        raise InvalidGitHubURL("The GitHub repository name is invalid")
    # GitHub repository identity is case-insensitive. Normalising here makes
    # immutable-commit caching converge even when the submitted URL casing varies.
    return GitHubRepoRef(owner=owner.lower(), repository=repository.lower())


def planned_keyword_tokens(values: str | Iterable[str]) -> frozenset[str]:
    """Return stable path-search tokens from planned feature descriptions."""

    source = [values] if isinstance(values, str) else values
    tokens: set[str] = set()
    for value in source:
        for raw in re.findall(r"[a-z0-9]+", str(value).lower()):
            if len(raw) < 3 or raw in _STOP_WORDS:
                continue
            tokens.add(raw)
            if len(raw) > 4 and raw.endswith("ies"):
                tokens.add(f"{raw[:-3]}y")
            elif len(raw) > 4 and raw.endswith("es"):
                tokens.add(raw[:-2])
            elif len(raw) > 3 and raw.endswith("s"):
                tokens.add(raw[:-1])
    return frozenset(tokens)


def is_safe_text_path(path: str) -> bool:
    """Return whether a tree path is eligible to be fetched as plain text."""

    if not path or len(path) > 1_024 or path.startswith("/") or "//" in path:
        return False
    if any(ord(character) < 32 for character in path):
        return False

    pure_path = PurePosixPath(path)
    if any(part in {"", ".", ".."} for part in pure_path.parts):
        return False
    lowered_parts = tuple(part.lower() for part in pure_path.parts)
    name = lowered_parts[-1]
    if any(part in _VENDOR_SEGMENTS for part in lowered_parts[:-1]):
        return False
    if name in _SECRET_FILENAMES or name.startswith(".env."):
        return False
    if name in _LOCK_FILENAMES:
        return False
    if PurePosixPath(name).suffix in _SECRET_SUFFIXES:
        return False
    if name.endswith((".min.js", ".min.css", ".map")):
        return False
    if name.startswith("readme"):
        return True
    return name in _TEXT_FILENAMES or PurePosixPath(name).suffix in _TEXT_SUFFIXES


def is_test_path(path: str) -> bool:
    """Return whether a path is a test, by directory or by filename convention."""

    pure_path = PurePosixPath(path.lower())
    name = pure_path.name
    return (
        bool({"test", "tests", "spec", "specs", "__tests__"} & set(pure_path.parts))
        or name.startswith(("test_", "spec."))
        or name.endswith("_test.py")
        or ".test." in name
        or ".spec." in name
    )


def _is_reserved_evidence(path: str) -> bool:
    """Return whether a path is always worth a slot, whatever else competes."""

    name = PurePosixPath(path.lower()).name
    return name.startswith("readme") or name in _MANIFESTS


def relevance_score(path: str, planned_keywords: Iterable[str] = ()) -> int:
    """Score a safe path deterministically; higher scores are fetched first."""

    lowered = path.lower()
    pure_path = PurePosixPath(lowered)
    name = pure_path.name
    parts = set(pure_path.parts)
    # Architecture bonuses describe where an implementation lives, so they are
    # gated on a source suffix. Without the gate, a top-level `api/` directory
    # - the ordinary shape of a monorepo - handed the same +80 to every file
    # beneath it, including `.gitignore` and empty `__init__.py`, which then
    # outranked the service layer and the README.
    implements = PurePosixPath(name).suffix in _SOURCE_SUFFIXES
    is_test = is_test_path(lowered)
    score = 10

    if name.startswith("readme"):
        score += 100
    if name in _MANIFESTS:
        score += 95
    if implements and (
        parts
        & {
            "controller",
            "controllers",
            "handler",
            "handlers",
            "route",
            "router",
            "routers",
            "routes",
            "service",
            "services",
            "view",
            "views",
        }
        or any(word in name for word in ("api", "controller", "route", "service"))
    ):
        score += 80
    # A bare `api/` directory is a deployment unit, not a layer: in a monorepo
    # it contains the config, the database wiring and the tests as well as the
    # implementation. It earns a weaker signal than `services/` or `routes/`,
    # which name what the code inside them actually does.
    if implements and "api" in parts:
        score += 25
    if implements and (
        parts & {"migration", "migrations", "model", "models", "schema", "schemas"}
        or any(word in name for word in ("migration", "model", "schema"))
    ):
        score += 78
    if implements and parts & {
        "component",
        "components",
        "page",
        "pages",
        "screen",
        "screens",
        "ui",
    }:
        score += 70
    # Tests prove that testing exists - one scored category - but they are not
    # evidence that a feature is implemented, so they must never outrank the
    # implementation they exercise.
    if is_test:
        score += 40
    if (
        name in _DEPLOYMENT_FILES
        or ".github" in parts
        or parts & {"deploy", "deployment", "migrations"}
    ):
        score += 72
    if name in {"app.py", "main.py", "main.ts", "main.tsx", "server.js", "server.ts"}:
        score += 60

    path_tokens = planned_keyword_tokens(re.findall(r"[a-z0-9]+", lowered))
    matches = path_tokens & frozenset(planned_keywords)
    if matches:
        bonus = 90 + min(30, 10 * (len(matches) - 1))
        # `test_reminders.py` matching "reminders" says the feature was tested,
        # not built. Half credit keeps the signal without letting a test suite
        # crowd out the code it covers.
        score += bonus // 2 if is_test else bonus
    return score


def redact_inline_secrets(content: str) -> str:
    """Redact likely credential values before repository text leaves this layer."""

    redacted = _PRIVATE_KEY_RE.sub("[REDACTED PRIVATE KEY]", content)
    for pattern in _INLINE_SECRET_PATTERNS:
        redacted = pattern.sub("[REDACTED CREDENTIAL]", redacted)

    def replace_assignment(match: re.Match[str]) -> str:
        quote_character = match.group(2) or match.group(4)
        return f"{match.group(1)}{quote_character}[REDACTED]{quote_character}"

    return _ASSIGNMENT_SECRET_RE.sub(replace_assignment, redacted)


class GitHubEvidenceCollector:
    """Collect a small evidence pack from a public repository at one commit."""

    def __init__(
        self,
        *,
        token: str | None = None,
        limits: GitHubLimits | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.limits = limits or GitHubLimits()
        self._token = token.strip() if token else None
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(self.limits.request_timeout_seconds),
            trust_env=False,
        )

    async def __aenter__(self) -> GitHubEvidenceCollector:
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close only the client created by this collector."""

        if self._owns_client:
            await self._client.aclose()

    async def collect(
        self,
        repository_url: str,
        *,
        planned_keywords: str | Iterable[str] = (),
    ) -> RepositoryEvidence:
        """Return bounded text evidence for one immutable default-branch commit."""

        repository = parse_github_repository_url(repository_url)
        deadline = time.monotonic() + self.limits.total_timeout_seconds
        repo_path = f"/repos/{quote(repository.owner)}/{quote(repository.repository)}"

        metadata = await self._request_json(
            repo_path,
            deadline=deadline,
            max_response_bytes=self.limits.max_metadata_response_bytes,
        )
        if metadata.get("private") is not False:
            raise GitHubRepositoryRejected("Only public GitHub repositories can be analyzed")
        repository_size = self._required_non_negative_int(metadata, "size", "repository size")
        if repository_size > self.limits.max_repository_kib:
            raise GitHubRepositoryRejected(
                f"Repository is larger than the {self.limits.max_repository_kib} KiB limit"
            )
        default_branch = metadata.get("default_branch")
        if not isinstance(default_branch, str) or not _SAFE_REF_RE.fullmatch(default_branch):
            raise GitHubProtocolError("GitHub returned an invalid default branch")

        commit = await self._request_json(
            f"{repo_path}/commits/{quote(default_branch, safe='')}",
            deadline=deadline,
            max_response_bytes=self.limits.max_metadata_response_bytes,
        )
        commit_sha = self._required_sha(commit.get("sha"), "default branch commit")
        tree = await self._request_json(
            f"{repo_path}/git/trees/{commit_sha}?recursive=1",
            deadline=deadline,
            max_response_bytes=self.limits.max_tree_response_bytes,
        )
        raw_entries = tree.get("tree")
        if not isinstance(raw_entries, list):
            raise GitHubProtocolError("GitHub returned an invalid repository tree")

        reported_count = len(raw_entries)
        processed_entries = raw_entries[: self.limits.max_tree_entries]
        tree_complete = not bool(tree.get("truncated")) and reported_count <= len(processed_entries)
        limitations: list[str] = ["Static inspection only; repository code was not executed."]
        if not tree_complete:
            limitations.append(
                f"Repository tree was incomplete; at most {self.limits.max_tree_entries} entries "
                "were considered."
            )

        tokens = planned_keyword_tokens(planned_keywords)
        candidates = self._candidates(processed_entries, tokens)
        selected = self._select_within_declared_budget(candidates)
        files = await self._fetch_candidates(repo_path, selected, deadline)
        bytes_analyzed = sum(item.size_bytes for item in files)
        if len(files) < len(selected):
            limitations.append("Some selected files were unavailable, binary, or invalid text.")
        if len(candidates) > len(selected):
            limitations.append(
                f"File selection was capped at {self.limits.max_files} files and "
                f"{self.limits.max_total_bytes} bytes."
            )

        return RepositoryEvidence(
            repository=repository,
            default_branch=default_branch,
            commit_sha=commit_sha,
            repository_size_kib=repository_size,
            tree_complete=tree_complete,
            tree_entries_reported=reported_count,
            tree_entries_processed=len(processed_entries),
            files_considered=len(candidates),
            bytes_analyzed=bytes_analyzed,
            files=files,
            limitations=tuple(limitations),
        )

    def _candidates(self, entries: list[Any], planned_keywords: frozenset[str]) -> list[_Candidate]:
        candidates: list[_Candidate] = []
        for entry in entries:
            if not isinstance(entry, Mapping) or entry.get("type") != "blob":
                continue
            path = entry.get("path")
            sha = entry.get("sha")
            size = entry.get("size")
            if not isinstance(path, str) or not is_safe_text_path(path):
                continue
            if not isinstance(size, int) or isinstance(size, bool) or size < 0:
                continue
            if not (self.limits.effective_min_file_bytes <= size <= self.limits.max_file_bytes):
                continue
            try:
                safe_sha = self._required_sha(sha, f"blob for {path}")
            except GitHubProtocolError:
                continue
            candidates.append(
                _Candidate(
                    path=path,
                    sha=safe_sha,
                    declared_size=size,
                    score=relevance_score(path, planned_keywords),
                )
            )
        return sorted(candidates, key=lambda item: (-item.score, item.path.lower(), item.path))

    def _select_within_declared_budget(
        self, candidates: list[_Candidate]
    ) -> tuple[_Candidate, ...]:
        """Fill the budget by score, but never let one file role crowd out the rest.

        Pure score ordering is not enough. On a real monorepo it selected ten
        test files, three empty package markers and a `.gitignore`, while the
        README and the entire service layer - where every planned feature is
        actually implemented - lost the budget. A Planned-vs-Built report built
        on that evidence reports working features as missing, which is worse
        than reporting nothing.
        """

        selected: list[_Candidate] = []
        selected_bytes = 0
        tests_taken = 0

        def take(candidate: _Candidate) -> bool:
            nonlocal selected_bytes, tests_taken
            if len(selected) >= self.limits.max_files:
                return False
            if selected_bytes + candidate.declared_size > self.limits.max_total_bytes:
                return False
            selected.append(candidate)
            selected_bytes += candidate.declared_size
            if is_test_path(candidate.path):
                tests_taken += 1
            return True

        # The README and the manifests are the cheapest, highest-signal files in
        # any repository: what the student says it does, and what it depends on.
        # Reading them is not negotiable, so they are taken before the contest
        # for the remaining slots begins.
        reserved = [item for item in candidates if _is_reserved_evidence(item.path)]
        remaining = [item for item in candidates if not _is_reserved_evidence(item.path)]
        for candidate in reserved:
            take(candidate)

        for candidate in remaining:
            if len(selected) >= self.limits.max_files:
                break
            if is_test_path(candidate.path) and tests_taken >= self.limits.effective_max_test_files:
                continue
            take(candidate)

        return tuple(selected)

    async def _fetch_candidates(
        self,
        repo_path: str,
        candidates: tuple[_Candidate, ...],
        deadline: float,
    ) -> tuple[EvidenceFile, ...]:
        semaphore = asyncio.Semaphore(self.limits.max_concurrency)

        async def fetch(candidate: _Candidate) -> EvidenceFile | None:
            async with semaphore:
                try:
                    payload = await self._request_json(
                        f"{repo_path}/git/blobs/{candidate.sha}",
                        deadline=deadline,
                        max_response_bytes=(self.limits.max_file_bytes * 2) + 64 * 1024,
                    )
                    return self._decode_blob(candidate, payload)
                except (GitHubNotFound, GitHubProtocolError):
                    return None

        if not candidates:
            return ()
        results = await asyncio.gather(*(fetch(candidate) for candidate in candidates))
        files: list[EvidenceFile] = []
        total = 0
        for result in results:
            if result is None or total + result.size_bytes > self.limits.max_total_bytes:
                continue
            files.append(result)
            total += result.size_bytes
        return tuple(files)

    def _decode_blob(
        self, candidate: _Candidate, payload: Mapping[str, Any]
    ) -> EvidenceFile | None:
        if payload.get("encoding") != "base64" or not isinstance(payload.get("content"), str):
            return None
        try:
            encoded = "".join(payload["content"].split())
            raw = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            return None
        if len(raw) > self.limits.max_file_bytes or b"\x00" in raw:
            return None
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return None
        return EvidenceFile(
            path=candidate.path,
            sha=candidate.sha,
            size_bytes=len(raw),
            relevance_score=candidate.score,
            content=redact_inline_secrets(content),
        )

    async def _request_json(
        self,
        endpoint: str,
        *,
        deadline: float,
        max_response_bytes: int,
    ) -> dict[str, Any]:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise GitHubTimeout("GitHub collection exceeded its total time budget")
        timeout_seconds = min(self.limits.request_timeout_seconds, remaining)
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "IdeaForge-evidence-collector/1",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"

        url = f"{GITHUB_API_BASE}{endpoint}"
        try:
            async with asyncio.timeout(remaining):
                async with self._client.stream(
                    "GET",
                    url,
                    headers=headers,
                    timeout=httpx.Timeout(timeout_seconds),
                    follow_redirects=False,
                ) as response:
                    self._raise_for_status(response)
                    content_length = response.headers.get("content-length")
                    if (
                        content_length
                        and content_length.isdigit()
                        and int(content_length) > max_response_bytes
                    ):
                        raise GitHubProtocolError("GitHub response exceeded its byte limit")
                    body = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=64 * 1024):
                        body.extend(chunk)
                        if len(body) > max_response_bytes:
                            raise GitHubProtocolError("GitHub response exceeded its byte limit")
        except (TimeoutError, httpx.TimeoutException) as exc:
            raise GitHubTimeout("GitHub did not respond within the collection deadline") from exc
        except httpx.RequestError as exc:
            raise GitHubError("GitHub could not be reached") from exc

        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise GitHubProtocolError("GitHub returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise GitHubProtocolError("GitHub returned an unexpected JSON response")
        return payload

    def _raise_for_status(self, response: httpx.Response) -> None:
        status = response.status_code
        if status == 404:
            raise GitHubNotFound("Public GitHub repository or object was not found")
        if status == 429 or (
            status == 403 and response.headers.get("x-ratelimit-remaining", "").strip() == "0"
        ):
            retry_after = response.headers.get("retry-after")
            reset_at = response.headers.get("x-ratelimit-reset")
            if retry_after is None and reset_at and reset_at.isdigit():
                retry_after = str(max(1, int(reset_at) - int(time.time())))
            raise GitHubRateLimited(
                "GitHub API rate limit reached",
                retry_after=retry_after,
                authenticated=self._token is not None,
            )
        if 300 <= status < 400:
            # Requests are built from owner/repo against the hard-coded API
            # host, so a redirect here means GitHub moved the repository rather
            # than that the URL was sloppy. Redirects are still never followed
            # - that is the SSRF guarantee - but this is the student's mistake
            # to fix, not a server fault, so it must not surface as a 5xx.
            raise GitHubRepositoryMoved(
                "This repository redirects, which usually means it was renamed or "
                "transferred. Open it on GitHub and use the URL it lands on."
            )
        if status < 200 or status >= 300:
            raise GitHubError(f"GitHub API request failed with status {status}")

    @staticmethod
    def _required_sha(value: object, label: str) -> str:
        if not isinstance(value, str) or not _OBJECT_SHA_RE.fullmatch(value):
            raise GitHubProtocolError(f"GitHub returned an invalid {label} SHA")
        return value.lower()

    @staticmethod
    def _required_non_negative_int(payload: Mapping[str, Any], key: str, label: str) -> int:
        value = payload.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise GitHubProtocolError(f"GitHub returned an invalid {label}")
        return value
