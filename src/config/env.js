import "dotenv/config";

const numericEnv = (value, fallback) => {
  const raw = typeof value === "string" ? value.trim() : value;

  if (raw === "" || raw === undefined || raw === null) {
    return fallback;
  }

  const parsed = Number(raw);
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
  PLIVO_AUTH_ID: process.env.PLIVO_AUTH_ID,
  PLIVO_AUTH_TOKEN: process.env.PLIVO_AUTH_TOKEN,
  PLIVO_PHONE_NUMBER: process.env.PLIVO_PHONE_NUMBER,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  LIVEKIT_SIP_DOMAIN: process.env.LIVEKIT_SIP_DOMAIN,
};

export function assertRequiredEnv(keys) {
  const requiredKeys = Array.isArray(keys) ? keys : [keys];
  const missing = requiredKeys.filter((key) => {
    const value = env[key];
    return value == null || String(value).trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function livekitApiHost(url) {
  if (typeof url !== "string") {
    return url;
  }

  const normalized = url.trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/^wss:/i, "https:")
    .replace(/^ws:/i, "http:");
}
