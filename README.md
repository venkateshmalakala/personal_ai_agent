# Personal AI Voice Agent

This project provides a browser-based LiveKit voice assistant that captures microphone audio, streams it through a LiveKit room, dispatches the session to a Cloud agent worker, and then uses Deepgram for STT, Groq for LLM inference, and Cartesia for TTS.

The web client can also start an outbound phone call through Plivo. When the callee answers, Plivo connects the call to LiveKit SIP, and the agent receives the supplied call context from room metadata.

## Architecture

Browser -> Web Server -> LiveKit Room -> Agent Dispatch -> Cloud Agent Worker -> Deepgram -> Groq -> Cartesia -> Speaker

## Local development

1. Copy `.env.example` to `.env` and fill in the values for your environment.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Launch the local agent:
   ```bash
   pnpm dev
   ```
4. Start the web client in a second terminal:
   ```bash
   pnpm web
   ```
5. Open `http://localhost:3000` in a browser.

## Production / LiveKit Cloud

- Keep the web server separate from the agent worker.
- The web app requests a token from the web server and creates a LiveKit room.
- The server calls `AgentDispatchClient.createDispatch(room, agentName)` to route the room to the deployed worker.
- The deployed Cloud worker must be registered under the same `LIVEKIT_AGENT_NAME` and should receive jobs independent of local development.

## Environment variables

```env
NODE_ENV=development
WEB_PORT=3000
LIVEKIT_URL=wss://your-livekit-url.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_AGENT_NAME=personal-ai-voice-agent
LIVEKIT_SIP_DOMAIN=your-livekit-sip-domain
PUBLIC_BASE_URL=https://your-public-web-server.example.com
PLIVO_AUTH_ID=your_plivo_auth_id
PLIVO_AUTH_TOKEN=your_plivo_auth_token
PLIVO_PHONE_NUMBER=+15551234567
GROQ_API_KEY=your_groq_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
CARTESIA_API_KEY=your_cartesia_api_key
```

Configure LiveKit SIP with an inbound trunk for Plivo and a **callee dispatch rule** bound to that trunk, with no room prefix and randomization disabled. The inbound trunk must accept calls to any destination (an empty `numbers` list) and have an appropriate source-address allowlist or authentication. The Plivo answer webhook dials `sip:<generated-room-name>@<LIVEKIT_SIP_DOMAIN>`, so the rule must use the SIP `To` username as the room name. The server creates each room with call context and explicitly dispatches `LIVEKIT_AGENT_NAME` to it before placing the call; make sure the agent is deployed and available in LiveKit Cloud. `PUBLIC_BASE_URL` must be publicly reachable by Plivo and should not include a path. The outbound-call endpoint accepts E.164 numbers and optional context up to 4000 characters.

## Important notes

- Never expose server-side secrets in browser code.
- Keep `.env` local and untracked.
- Do not add Plivo/SIP until the LiveKit Cloud agent architecture is proven independent of a local worker.

## Testing

```bash
pnpm test
```

## Troubleshooting

- If the deployed agent does not respond, verify `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_AGENT_NAME` are consistent with the Cloud deployment.
- If a phone call connects but has no assistant audio, check the LiveKit agent logs for the matching room. Verify the SIP dispatch rule is a callee rule with `randomize` disabled and no room prefix, and the SIP trunk is associated with that rule and accepts the SIP destination.
- If the local agent works but the Cloud worker does not, confirm that the agent is not being dispatched to a different project or name.
- If browser connection fails, verify the web server can generate a token and create a dispatch.

## Notes

This project intentionally keeps the agent and web server separated, while preserving the working local STT/LLM/TTS configuration: Deepgram, Groq, and Cartesia.
