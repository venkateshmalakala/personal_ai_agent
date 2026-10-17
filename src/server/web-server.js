import "dotenv/config";

import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";

import { assertRequiredEnv, env, livekitApiHost } from "../config/env.js";

const root = join(fileURLToPath(new URL("../..", import.meta.url)), "public");
const port = env.WEB_PORT;
const agentName = env.LIVEKIT_AGENT_NAME;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

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
