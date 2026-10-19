import "dotenv/config";

import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import plivo from "plivo";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";

import { assertRequiredEnv, env, livekitApiHost } from "../config/env.js";

const root = join(fileURLToPath(new URL("../..", import.meta.url)), "public");
const port = env.WEB_PORT;
const agentName = env.LIVEKIT_AGENT_NAME;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function sendXml(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/xml; charset=utf-8" });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readFormBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function makeLiveKitRoomService() {
  return new RoomServiceClient(
    livekitApiHost(env.LIVEKIT_URL),
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
}

async function handleMakeCall(request, response) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const isTooLarge = error instanceof Error && error.message === "Request body is too large";
    sendJson(response, isTooLarge ? 413 : 400, {
      error: isTooLarge ? error.message : "Request body must contain valid JSON",
    });
    return;
  }

  const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  const context = typeof body?.context === "string" ? body.context.trim() : "";

  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    sendJson(response, 400, { error: "phoneNumber must be a valid E.164 number" });
    return;
  }
  if (context.length > 4000) {
    sendJson(response, 400, { error: "context must be 4000 characters or fewer" });
    return;
  }

  try {
    assertRequiredEnv([
      "PLIVO_AUTH_ID",
      "PLIVO_AUTH_TOKEN",
      "PLIVO_PHONE_NUMBER",
      "PUBLIC_BASE_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
      "LIVEKIT_URL",
      "LIVEKIT_SIP_DOMAIN",
    ]);

    const roomName = `outbound-${randomUUID()}`;
    const answerUrl = new URL("/api/plivo/answer", env.PUBLIC_BASE_URL);
    answerUrl.searchParams.set("roomName", roomName);
    answerUrl.searchParams.set("context", context);
    const hangupUrl = new URL("/api/plivo/hangup", env.PUBLIC_BASE_URL);
    hangupUrl.searchParams.set("roomName", roomName);

    await makeLiveKitRoomService().createRoom({
      name: roomName,
      metadata: JSON.stringify({ context }),
    });

    const dispatchClient = new AgentDispatchClient(
      livekitApiHost(env.LIVEKIT_URL),
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
    await dispatchClient.createDispatch(roomName, agentName);
    console.log("[SERVER] Outbound agent dispatch created", { roomName, agentName });

    const client = new plivo.Client(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN);
    await client.calls.create(
      env.PLIVO_PHONE_NUMBER,
      phoneNumber,
      answerUrl.toString(),
      {
        answerMethod: "GET",
        hangupUrl: hangupUrl.toString(),
        hangupMethod: "POST",
      },
    );

    console.log("[SERVER] Outbound call initiated", { roomName, phoneNumber });
    sendJson(response, 200, { success: true, roomName });
  } catch (error) {
    console.error("[SERVER] Outbound call failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(response, 500, { success: false, error: "Unable to start outbound call" });
  }
}

async function handlePlivoAnswer(requestUrl, response) {
  const roomName = requestUrl.searchParams.get("roomName") || "";
  const context = requestUrl.searchParams.get("context") || "";
  console.log("[SERVER] Plivo answer webhook received", { roomName });
  if (!/^outbound-[0-9a-f-]{36}$/i.test(roomName) || context.length > 4000) {
    console.error("[SERVER] Plivo answer webhook received invalid call details", { roomName });
    sendXml(response, 400, "<Response><Speak>Invalid call details.</Speak></Response>");
    return;
  }

  try {
    assertRequiredEnv(["LIVEKIT_SIP_DOMAIN"]);

    const sipDomain = env.LIVEKIT_SIP_DOMAIN.replace(/^sip:/i, "").replace(/\/+$/, "");
    const sipUri = `sip:${roomName}@${sipDomain}`;
    sendXml(
      response,
      200,
      `<Response><Dial><User>${escapeXml(sipUri)}</User></Dial></Response>`,
    );
    console.log("[SERVER] Plivo SIP dial instructions returned", { roomName });
  } catch (error) {
    console.error("[SERVER] Plivo answer webhook failed", {
      roomName,
      error: error instanceof Error ? error.message : String(error),
    });
    sendXml(response, 500, "<Response><Speak>Unable to connect your call.</Speak></Response>");
  }
}

async function handlePlivoHangup(request, requestUrl, response) {
  try {
    const form = await readFormBody(request);
    console.log("[SERVER] Plivo call ended", {
      roomName: requestUrl.searchParams.get("roomName") || "unknown",
      callUuid: form.get("CallUUID") || "unknown",
      callStatus: form.get("CallStatus") || "unknown",
      hangupCause: form.get("HangupCause") || "unknown",
      duration: form.get("Duration") || "unknown",
    });
    response.writeHead(204);
    response.end();
  } catch (error) {
    console.error("[SERVER] Plivo hangup callback could not be read", {
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(response, 400, { error: "Invalid hangup callback" });
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/make-call" && request.method === "POST") {
    void handleMakeCall(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/plivo/answer" && request.method === "GET") {
    void handlePlivoAnswer(requestUrl, response);
    return;
  }

  if (requestUrl.pathname === "/api/plivo/hangup" && request.method === "POST") {
    void handlePlivoHangup(request, requestUrl, response);
    return;
  }

  if (requestUrl.pathname === "/token") {
    try {
      assertRequiredEnv(["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_URL"]);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "LiveKit environment is incomplete" });
      return;
    }

    const room = requestUrl.searchParams.get("room") || `personal-${randomUUID()}`;
    const identity = `browser-${randomUUID()}`;
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity,
      ttl: "10m",
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    token.toJwt()
      .then(async (jwt) => {
        try {
          const dispatchClient = new AgentDispatchClient(
            livekitApiHost(env.LIVEKIT_URL),
            env.LIVEKIT_API_KEY,
            env.LIVEKIT_API_SECRET,
          );

          await dispatchClient.createDispatch(room, agentName);

          console.log("[SERVER] Agent dispatch created", { room, agentName });
          sendJson(response, 200, {
            token: jwt,
            url: env.LIVEKIT_URL,
            room,
            identity,
          });
        } catch (error) {
          console.error("[SERVER] Agent dispatch failed", {
            room,
            agentName,
            error: error instanceof Error ? error.message : String(error),
          });
          sendJson(response, 500, { error: "Unable to prepare the voice session" });
        }
      })
      .catch((error) => {
        console.error("[SERVER] Token generation failed", {
          room,
          error: error instanceof Error ? error.message : String(error),
        });
        sendJson(response, 500, { error: "Unable to prepare the voice session" });
      });

    return;
  }

  const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const contentType = extname(filePath) === ".js" ? "text/javascript" : "text/html";
  createReadStream(filePath)
    .on("error", () => {
      response.writeHead(404);
      response.end("Not found");
    })
    .once("open", () => response.writeHead(200, { "content-type": contentType }))
    .pipe(response);
});

server.listen(port, () => {
  console.log(`[SERVER] Voice assistant web client listening on http://localhost:${port}`);
});

export default server;
