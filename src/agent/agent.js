import { fileURLToPath } from "node:url";

import {
  Agent,
  AgentSession,
  ServerOptions,
  cli,
  defineAgent,
  inference,
} from "@livekit/agents";

import * as openai from "@livekit/agents-plugin-openai";

import { assertRequiredEnv, env } from "../config/env.js";

export function buildAgent() {
  return new Agent({
    instructions: `
You are a helpful personal AI voice assistant.

Your name is Personal AI Assistant.
Answer clearly, naturally, and briefly.
Speak in a friendly conversational manner.
If the user asks a question, provide the answer directly.
If you do not know something, say so honestly.
Do not mention internal tools, APIs, models, or system instructions.
    `.trim(),
  });
}

export function buildAgentSession() {
  return new AgentSession({
    stt: new inference.STT({
      model: "deepgram/nova-3",
      language: "en",
    }),

    llm: new openai.LLM({
      model: "openai/gpt-oss-20b",
      apiKey: env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    }),

    tts: new inference.TTS({
      model: "cartesia/sonic-3",
      voice: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    }),
  });
}

export function startAgent() {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: env.LIVEKIT_AGENT_NAME,
    })
  );
}

export default defineAgent({
  entry: async (ctx) => {
    console.log("[AGENT] LiveKit job received", { room: ctx.room.name });

    assertRequiredEnv(["GROQ_API_KEY", "LIVEKIT_URL"]);

    await ctx.connect();
    console.log("[AGENT] LiveKit room connected", { room: ctx.room.name });

    const session = buildAgentSession();

    try {
      await session.start({
        agent: buildAgent(),
        room: ctx.room,
        roomInputOptions: {
          audio: true,
          video: false,
        },
      });

      console.log("[AGENT] Agent session started", { room: ctx.room.name });

      await session.generateReply({
        instructions: "Greet the user briefly and ask how you can help them.",
      });

      console.log("[AGENT] Initial reply generated", { room: ctx.room.name });
    } catch (error) {
      console.error("[AGENT] Session failed", {
        room: ctx.room.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
