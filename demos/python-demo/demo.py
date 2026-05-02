import asyncio
from vibelock import get, list as list_secrets, get_env
from vibelock.config import VibeLockOptions

opts = VibeLockOptions(project_id="demo-app", vault_path="./secrets.vibe")


def mask(val: str, show: int = 4) -> str:
    return val[:show] + "\u2022\u2022\u2022\u2022" + val[-4:]


async def main():
    names = await list_secrets(opts)
    print(f"Secrets: {names}")

    api_key = await get("API_KEY", opts)
    db_password = await get("DB_PASSWORD", opts)
    jwt_secret = await get("JWT_SECRET", opts)

    print(f"API_KEY: {mask(api_key)}")
    print(f"DB_PASSWORD: {mask(db_password)}")
    print(f"JWT_SECRET: {mask(jwt_secret)}")

    db_url = await get_env("DB_URL", opts)
    print(f"DB_URL (env): {db_url}")

    print("\n--- Simulated App Config ---")
    print(f"Connecting to {db_url} with password: {mask(db_password)}")
    print(f"API client initialized with key: {mask(api_key)}")
    print(f"JWT signing with secret: {mask(jwt_secret)}")
    print("App started successfully \u2713")


asyncio.run(main())
