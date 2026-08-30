"""Interactive local setup for HH OAuth credentials.

Secrets are entered through getpass and written directly to the OS keyring;
they are intentionally not accepted as command-line arguments.
"""

from __future__ import annotations

import argparse
import getpass

from app.security.keyring import OSKeyring, SecretSlot


def main() -> None:
    parser = argparse.ArgumentParser(prog='vacancypilot-hh-credentials')
    parser.add_argument('action', choices=('set-client-secret', 'delete-client-secret', 'status'))
    args = parser.parse_args()
    keyring = OSKeyring()
    if args.action == 'set-client-secret':
        secret = getpass.getpass('HH OAuth client secret (input hidden): ')
        if not secret.strip():
            raise SystemExit('Client secret must not be empty')
        keyring.set_secret(SecretSlot.HH_CLIENT_SECRET, secret)
        print('HH OAuth client secret stored in the OS keyring.')
    elif args.action == 'delete-client-secret':
        keyring.delete_secret(SecretSlot.HH_CLIENT_SECRET)
        print('HH OAuth client secret removed from the OS keyring.')
    else:
        print('configured=' + str(bool(keyring.get_secret(SecretSlot.HH_CLIENT_SECRET))))


if __name__ == '__main__':
    main()
