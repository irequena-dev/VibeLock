function mask(val, show = 4) {
  return val.slice(0, show) + "\u2022\u2022\u2022\u2022" + val.slice(-4);
}

const { API_KEY, DB_PASSWORD, JWT_SECRET } = process.env;

if (!API_KEY || !DB_PASSWORD || !JWT_SECRET) {
  console.error("Error: Missing required environment variables.");
  const missing = [
    ["API_KEY", API_KEY],
    ["DB_PASSWORD", DB_PASSWORD],
    ["JWT_SECRET", JWT_SECRET],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  console.error(`Missing: ${missing.join(", ")}`);
  console.error("Make sure to inject them via: vibelock run -- node app.mjs");
  process.exit(1);
}

console.log("Secrets loaded from environment:");
console.log(`  API_KEY:     ${mask(API_KEY)}`);
console.log(`  DB_PASSWORD: ${mask(DB_PASSWORD)}`);
console.log(`  JWT_SECRET:  ${mask(JWT_SECRET)}`);

console.log("\n--- Simulated App Config ---");
console.log(`Connecting to DB with password: ${mask(DB_PASSWORD)}`);
console.log(`API client initialized with key: ${mask(API_KEY)}`);
console.log(`JWT signing with secret: ${mask(JWT_SECRET)}`);
console.log("App started successfully \u2713");
