import argparse
import sys

from .sdk import init, set, get, list_secrets, remove


def main():
    parser = argparse.ArgumentParser(
        prog="vibelock",
        description="VibeLock secrets management CLI",
    )
    parser.add_argument("--vault-path", default="./secrets.vibe")

    subparsers = parser.add_subparsers(dest="command")

    sp_init = subparsers.add_parser("init", help="Initialize a new vault")
    sp_init.add_argument("--project-id", default=None)
    sp_init.add_argument("--keys-path", default=None)

    sp_set = subparsers.add_parser("set", help="Set a secret")
    sp_set.add_argument("key")
    sp_set.add_argument("value")

    sp_get = subparsers.add_parser("get", help="Get a secret")
    sp_get.add_argument("key")

    subparsers.add_parser("list", help="List all secrets")

    sp_rm = subparsers.add_parser("remove", help="Remove a secret")
    sp_rm.add_argument("key")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    vp = args.vault_path

    if args.command == "init":
        init(
            vault_path=vp,
            project_id=args.project_id,
            keys_path=args.keys_path,
        )
        print(f"Vault initialized at {vp}")

    elif args.command == "set":
        set(args.key, args.value, vault_path=vp)
        print(f"Secret '{args.key}' saved")

    elif args.command == "get":
        value = get(args.key, vault_path=vp)
        print(value)

    elif args.command == "list":
        keys = list_secrets(vault_path=vp)
        for k in keys:
            print(k)

    elif args.command == "remove":
        remove(args.key, vault_path=vp)
        print(f"Secret '{args.key}' removed")
