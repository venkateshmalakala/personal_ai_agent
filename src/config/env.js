import "dotenv/config";

const numericEnv = (value, fallback) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  WEB_PORT: numericEnv(process.env.WEB_PORT, 3000),
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  LIVEKIT_AGENT_NAME: process.env.LIVEKIT_AGENT_NAME || "personal-ai-voice-agent",
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
};

export function assertRequiredEnv(keys) {
  const missing = keys.filter((key) => !env[key] || String(env[key]).trim() === "");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function livekitApiHost(url) {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}
