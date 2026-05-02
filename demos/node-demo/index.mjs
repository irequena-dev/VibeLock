import { get, list, getEnv } from "vibelock";

const opts = { projectId: "demo-app", vaultPath: "./secrets.vibe" };

const names = await list(opts);
console.log("Secrets:", names);

const apiKey = await get("API_KEY", opts);
const dbPassword = await get("DB_PASSWORD", opts);
const jwtSecret = await get("JWT_SECRET", opts);

function mask(val, show = 4) {
  return val.slice(0, show) + "\u2022\u2022\u2022\u2022" + val.slice(-4);
}

console.log("API_KEY:", mask(apiKey));
console.log("DB_PASSWORD:", mask(dbPassword));
console.log("JWT_SECRET:", mask(jwtSecret));

const dbUrl = await getEnv("DB_URL", opts);
console.log("DB_URL (env):", dbUrl);

console.log("\n--- Simulated App Config ---");
console.log(`Connecting to ${dbUrl} with password: ${mask(dbPassword)}`);
console.log(`API client initialized with key: ${mask(apiKey)}`);
console.log(`JWT signing with secret: ${mask(jwtSecret)}`);
console.log("App started successfully \u2713");
