import "dotenv/config";

import { fileURLToPath } from "node:url";

import {
  Agent,
  AgentSession,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  voice,
} from "@livekit/agents";

import * as openai from "@livekit/agents-plugin-openai";

export default defineAgent({
  entry: async (ctx) => {
    console.log("Personal AI Voice Agent is starting...");

    const assistant = new Agent({
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

    const session = new AgentSession({
      stt: new inference.STT({
        model: "deepgram/nova-3",
        language: "en",
      }),

      llm: new openai.LLM({
        model: "llama-3.1-8b-instant",
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      }),

      tts: new inference.TTS({
        model: "cartesia/sonic-3",
        voice: "9626c31c-b5c4-4f28-8a3f-7c3f7f7f7f7f",
      }),
    });

    await session.start({
      agent: assistant,
      room: ctx.room,
      roomInputOptions: {
        audio: true,
        video: false,
      },
    });

    await session.generateReply({
      instructions:
        "Greet the user briefly and ask how you can help them.",
    });

    console.log("Personal AI Voice Agent is ready!");
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
  })
);