"""Verify that production output and the distributable zip contain no private data."""

from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / ".output" / "chrome-mv3"
PACKAGE_DIR = ROOT / ".output"

FORBIDDEN_PATH_PARTS = {
    ".local",
    ".env",
    "private-engine",
    "candidate-evidence",
    "private-candidate",
    "raw-provider-output",
}
FORBIDDEN_CONTENT = (
    re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(rb"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(rb"(?:C:[\\/]Users|C:[\\/]Dev|/home/|/Users/)[^\x00\r\n\"']{0,240}"),
    re.compile(rb"vacancypilot\.db(?:-wal|-shm)?", re.I),
    re.compile(rb"GENERATED \xe2\x80\x94 DO NOT EDIT"),
    re.compile(rb"export interface paths"),
)


def fail(message: str) -> None:
    raise SystemExit(f"RELEASE_ARTIFACT_SAFETY_FAILED: {message}")


def check_member_name(name: str) -> None:
    normalized = name.replace("\\", "/").lower()
    parts = set(normalized.split("/"))
    if parts & FORBIDDEN_PATH_PARTS:
        fail(f"forbidden private artifact path: {name}")
    if normalized.endswith(("/vacancypilot.db", "/vacancypilot.db-wal", "/vacancypilot.db-shm")):
        fail(f"runtime database artifact is packaged: {name}")
    if normalized.endswith(".map"):
        fail(f"source map is packaged without an explicit release policy: {name}")


def check_content(label: str, content: bytes) -> None:
    for pattern in FORBIDDEN_CONTENT:
        if pattern.search(content):
            fail(f"{label} contains a forbidden private/runtime marker: {pattern.pattern!r}")


def check_directory() -> None:
    if not OUTPUT_DIR.is_dir():
        fail(f"missing production output: {OUTPUT_DIR.relative_to(ROOT)}")
    files = sorted(path for path in OUTPUT_DIR.rglob("*") if path.is_file())
    if not files:
        fail("production output directory is empty")

    manifest = OUTPUT_DIR / "manifest.json"
    if not manifest.is_file():
        fail("production output is missing manifest.json")

    for path in files:
        check_member_name(path.relative_to(OUTPUT_DIR).as_posix())
        check_content(str(path.relative_to(ROOT)), path.read_bytes())


def check_zip() -> None:
    packages = sorted(PACKAGE_DIR.glob("*.zip"))
    if not packages:
        fail("no distributable zip found; run pnpm zip")
    for package in packages:
        with zipfile.ZipFile(package) as archive:
            names = sorted(archive.namelist())
            if not names:
                fail(f"empty distributable zip: {package.name}")
            for name in names:
                check_member_name(name)
                check_content(f"{package.name}:{name}", archive.read(name))


def main() -> int:
    check_directory()
    check_zip()
    print("Release artifact privacy checks passed for production output and zip package(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
