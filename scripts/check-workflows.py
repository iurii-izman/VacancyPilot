"""Static safety checks for GitHub Actions workflow policy.

This is intentionally a small, dependency-light gate.  It checks the
repository's workflow source as well as the parsed YAML so action pinning and
failure semantics cannot silently regress during routine edits.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_DIR = ROOT / ".github" / "workflows"
SHA_ACTION = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")
USES_LINE = re.compile(r"^\s*uses:\s*([^\s#]+)(?:\s+#\s*(.*))?\s*$")
VERIFIED_ACTION_REFS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node": "249970729cb0ef3589644e2896645e5dc5ba9c38",
    "actions/setup-python": "ece7cb06caefa5fff74198d8649806c4678c61a1",
    "astral-sh/setup-uv": "c771a70e6277c0a99b617c7a806ffedaca235ff9",
    "actions/dependency-review-action": "2031cfc080254a8a887f58cffee85186f0e49e48",
    "SonarSource/sonarqube-scan-action": "22918119ff8e1ca75a623e15c8296b6ea4fbe28f",
}


def fail(message: str) -> None:
    raise SystemExit(f"WORKFLOW_SAFETY_FAILED: {message}")


def iter_steps(value: Any):
    if isinstance(value, dict):
        steps = value.get("steps")
        if isinstance(steps, list):
            for step in steps:
                if isinstance(step, dict):
                    yield step
        for child in value.values():
            yield from iter_steps(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_steps(child)


def check_action_source(path: Path, text: str) -> None:
    for line_number, line in enumerate(text.splitlines(), start=1):
        match = USES_LINE.match(line)
        if not match:
            continue
        action_ref, comment = match.groups()
        if action_ref.startswith("./"):
            continue
        if not SHA_ACTION.fullmatch(action_ref):
            fail(f"{path.relative_to(ROOT)}:{line_number} uses an unpinned action: {action_ref}")
        action_name, sha = action_ref.split("@", maxsplit=1)
        if VERIFIED_ACTION_REFS.get(action_name) != sha:
            fail(
                f"{path.relative_to(ROOT)}:{line_number} uses an unverified action pin: {action_ref}",
            )
        if not comment or not re.search(r"\bv\d", comment):
            fail(
                f"{path.relative_to(ROOT)}:{line_number} pinned action is missing a semantic version comment",
            )


def check_permissions(path: Path, document: dict[str, Any]) -> None:
    permissions = document.get("permissions")
    if not isinstance(permissions, dict) or permissions.get("contents") != "read":
        fail(f"{path.relative_to(ROOT)} must declare top-level contents: read permissions")
    if any(value in {"write", "write-all"} for value in permissions.values()):
        fail(f"{path.relative_to(ROOT)} grants a write permission")


def check_dependency_review(path: Path, document: dict[str, Any]) -> None:
    if path.name != "dependency-review.yml":
        return
    matching = [
        step
        for step in iter_steps(document)
        if step.get("uses", "").startswith("actions/dependency-review-action@")
    ]
    if len(matching) != 1:
        fail("dependency-review.yml must contain exactly one dependency-review action")
    step = matching[0]
    if step.get("continue-on-error") is True:
        fail("dependency review must be blocking")
    severity = step.get("with", {}).get("fail-on-severity")
    if severity not in {"high", "critical"}:
        fail("dependency review must fail on high or critical severity")


def check_ci_gate(path: Path, text: str) -> None:
    if path.name == "ci.yml" and "pnpm verify:all" not in text:
        fail("ci.yml must run pnpm verify:all as the full repository quality gate")


def check_untrusted_trigger(path: Path, text: str) -> None:
    if re.search(r"^\s*pull_request_target\s*:", text, flags=re.MULTILINE):
        fail(f"{path.relative_to(ROOT)} uses pull_request_target")
    if re.search(r"secrets\.[A-Z0-9_]+.*(?:echo|printf)|(?:echo|printf).*secrets\.[A-Z0-9_]", text):
        fail(f"{path.relative_to(ROOT)} appears to print a secret")


def main() -> int:
    paths = sorted(WORKFLOW_DIR.glob("*.y*ml"))
    if not paths:
        fail("no workflow files found")

    for path in paths:
        source = path.read_text(encoding="utf-8")
        try:
            document = yaml.safe_load(source)
        except yaml.YAMLError as exc:
            fail(f"{path.relative_to(ROOT)} is not valid YAML: {exc}")
        if not isinstance(document, dict):
            fail(f"{path.relative_to(ROOT)} must contain a YAML mapping")
        check_action_source(path, source)
        check_permissions(path, document)
        check_dependency_review(path, document)
        check_ci_gate(path, source)
        check_untrusted_trigger(path, source)

    print(f"Workflow safety checks passed for {len(paths)} workflow(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
