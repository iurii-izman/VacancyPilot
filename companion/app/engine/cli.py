"""Engine V4 package CLI — AOPS-07.

Provides the ``vacancypilot-engine`` console command with ``install`` and
``verify`` subcommands.  Both operate on the configured engine data
directory and never modify the source package.
"""

from __future__ import annotations

import argparse
import os
import sys

from app.config import resolve_engine_package_root
from app.engine.installer import InstallResult, install_package, verify_package


def _install_cmd(args: argparse.Namespace) -> int:
    """Copy a package from the supplied source path into the engine data store."""
    source = args.source or os.environ.get('VACANCYPILOT_V4_PACKAGE_SOURCE', '')
    if not source:
        print(
            'ERROR: No source path supplied. Pass --source or set VACANCYPILOT_V4_PACKAGE_SOURCE.',
            file=sys.stderr,
        )
        return 1

    target_root = args.target or str(resolve_engine_package_root())

    print(f'Source:      {source}')
    print(f'Target root: {target_root}')
    print()

    result = install_package(source, target_root, force=args.force)
    _print_result(result)
    return 0 if result.valid else 1


def _verify_cmd(args: argparse.Namespace) -> int:
    """Validate an engine package in-place at the supplied path."""
    path = args.path
    if not path:
        target_root = args.target or str(resolve_engine_package_root())
        path = os.path.join(target_root, 'current')
    print(f'Path: {path}')
    print()

    result = verify_package(path)
    _print_result(result)
    return int(result.valid)


def _print_result(result: InstallResult) -> None:
    """Pretty-print an InstallResult."""
    print(f'Status:         {result.status}')
    print(f'Valid:          {result.valid}')
    if result.engine_version:
        print(f'Engine version: {result.engine_version}')
    if result.aggregate_hash:
        print(f'Aggregate hash: {result.aggregate_hash}')
    if result.active_count:
        print(f'Active files:   {result.active_count}')
    print(f'Target:         {result.target_path}')
    print()
    print(f'{result.message}')
    if result.validation_errors:
        print()
        print(f'Validation errors ({len(result.validation_errors)}):')
        for err in result.validation_errors:
            print(f'  {err.safe_summary()}')


def main() -> int:
    """Entry point for the ``vacancypilot-engine`` CLI."""
    parser = argparse.ArgumentParser(
        description='VacancyPilot Application Engine V4 — package installer and verifier',
    )
    sub = parser.add_subparsers(dest='command', help='Available commands')

    # install
    install_parser = sub.add_parser(
        'install', help='Copy, validate, and atomically activate an engine package'
    )
    install_parser.add_argument(
        '--source',
        help='Path to the source engine package directory. '
        'Defaults to VACANCYPILOT_V4_PACKAGE_SOURCE env var.',
    )
    install_parser.add_argument(
        '--target',
        help='Target engine data root directory (default: data/engine)',
    )
    install_parser.add_argument(
        '--force',
        action='store_true',
        help='Replace an existing valid package even if unchanged',
    )
    install_parser.set_defaults(func=_install_cmd)

    # verify
    verify_parser = sub.add_parser('verify', help='Validate an engine package in-place')
    verify_parser.add_argument(
        '--path',
        help='Path to an engine package directory. Defaults to <target>/current.',
    )
    verify_parser.add_argument(
        '--target',
        help='Target engine data root directory (default: data/engine)',
    )
    verify_parser.set_defaults(func=_verify_cmd)

    args = parser.parse_args()
    if args.command is None:
        parser.print_help()
        return 1

    result_code: int = int(args.func(args))
    return result_code


if __name__ == '__main__':
    raise SystemExit(main())
