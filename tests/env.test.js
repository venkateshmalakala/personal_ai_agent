import test from "node:test";
import assert from "node:assert/strict";

import { assertRequiredEnv, env, livekitApiHost } from "../src/config/env.js";

test("environment exposes required app settings", () => {
  assert.ok(env.NODE_ENV !== undefined);
  assert.ok(typeof env.WEB_PORT === "number");
  assert.ok(typeof env.LIVEKIT_AGENT_NAME === "string");
});

test("required environment variables are enforced", () => {
  const validation = () => assertRequiredEnv(["GROQ_API_KEY"]);
  assert.doesNotThrow(() => validation());

  const original = env.GROQ_API_KEY;
  env.GROQ_API_KEY = "";
  assert.throws(() => assertRequiredEnv(["GROQ_API_KEY"]), /Missing required environment variables/);
  env.GROQ_API_KEY = original;

  assert.doesNotThrow(() => assertRequiredEnv("GROQ_API_KEY"));
});

test("LiveKit URL conversion is correct", () => {
  assert.equal(livekitApiHost("wss://example.livekit.cloud"), "https://example.livekit.cloud");
  assert.equal(livekitApiHost("ws://localhost:7880"), "http://localhost:7880");
  assert.equal(livekitApiHost("WSS://example.livekit.cloud"), "https://example.livekit.cloud");
  assert.equal(livekitApiHost("   ws://localhost:7880   "), "http://localhost:7880");
});
