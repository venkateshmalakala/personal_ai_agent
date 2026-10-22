import { Room, RoomEvent, Track } from "https://cdn.jsdelivr.net/npm/livekit-client@2.22.3/+esm";

const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");
const startCallButton = document.querySelector("#startCallBtn");
const startCallLabel = document.querySelector("#startCallLabel");
const callForm = document.querySelector("#callForm");
const phoneNumberInput = document.querySelector("#phoneNumber");
const callContextInput = document.querySelector("#callContext");
const callFormMessage = document.querySelector("#callFormMessage");
const callStatusValue = document.querySelector("#callStatusValue");
const callStatusMessage = document.querySelector("#callStatusMessage");
const callStatusDot = document.querySelector("#callStatusDot");
const answeredBadge = document.querySelector("#answeredBadge");
const callDuration = document.querySelector("#callDuration");
const requestId = document.querySelector("#requestId");
const serverResponse = document.querySelector("#serverResponse");
const callResult = document.querySelector("#callResult");
const callResultPlaceholder = document.querySelector("#callResultPlaceholder");
const status = document.querySelector("#status");
const transcript = document.querySelector("#transcript");
const transcriptLines = new Map();
const assistantResponseSegments = new Map();
let room;
let callMonitorRoom;
let activeRoomName = "";
let statusPollTimer;
let durationTimer;
let callStartedAt;
let callEndedAt;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.className = isError ? "mt-1 text-xs text-rose-300" : "mt-1 text-xs text-slate-500";
}

function setCallFormMessage(message, isError = false) {
  callFormMessage.textContent = message;
  callFormMessage.className = isError
    ? "rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
    : "rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200";
}

function setCallStatus(value, message) {
  const styles = {
    Idle: ["bg-slate-500", "text-slate-100"],
    Calling: ["bg-amber-400", "text-amber-300"],
    "In Progress": ["bg-emerald-400", "text-emerald-300"],
    Failed: ["bg-rose-400", "text-rose-300"],
  };
  const [dotColor, textColor] = styles[value] || styles.Idle;

  callStatusValue.textContent = value;
  callStatusValue.className = `text-2xl font-semibold tracking-tight ${textColor}`;
  callStatusDot.className = `h-2.5 w-2.5 rounded-full ${dotColor}${value === "In Progress" ? " animate-pulse" : ""}`;
  callStatusMessage.textContent = message;
}

function setAnswered(answered, pending = false) {
  if (answered) {
    answeredBadge.textContent = "Yes · Answered";
    answeredBadge.className = "inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300";
  } else if (pending) {
    answeredBadge.textContent = "No · Pending";
    answeredBadge.className = "inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300";
  } else {
    answeredBadge.textContent = "No";
    answeredBadge.className = "inline-flex items-center rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-sm font-semibold text-rose-300";
  }
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateDuration() {
  if (!callStartedAt) {
    callDuration.textContent = "00:00";
    return;
  }
  const end = callEndedAt || Date.now();
  callDuration.textContent = formatDuration(Math.max(0, Math.floor((end - callStartedAt) / 1000)));
}

function displayServerResponse(payload) {
  serverResponse.textContent = JSON.stringify(payload, null, 2);
}

function attachAudio(track) {
  const element = track.attach();
  element.autoplay = true;
  element.setAttribute("data-livekit-audio", "true");
  document.body.append(element);
}

function resetCallTranscript() {
  transcriptLines.clear();
  assistantResponseSegments.clear();
  transcript.replaceChildren();
  const placeholder = document.createElement("p");
  placeholder.className = "text-slate-600";
  placeholder.textContent = "Waiting for conversation text…";
  transcript.append(placeholder);
  callResult.textContent = "";
  callResult.classList.add("hidden");
  callResultPlaceholder.textContent = "Your assistant’s final text response will appear here after the call ends.";
  callResultPlaceholder.classList.remove("hidden");
}

function showCallResult() {
  const responseText = [...assistantResponseSegments.values()].join(" ").trim();
  if (!responseText) {
    callResultPlaceholder.textContent = "No assistant response text was received during this call.";
    return;
  }

  callResult.textContent = responseText;
  callResult.classList.remove("hidden");
  callResultPlaceholder.classList.add("hidden");
}

function showTranscript(segments, participant, sourceRoom = room) {
  const placeholder = transcript.querySelector("p");
  if (placeholder?.textContent === "Waiting for conversation text…" || placeholder?.textContent === "Waiting for conversation audio…" || placeholder?.textContent === "No speech detected yet.") {
    placeholder.remove();
  }

  for (const segment of segments) {
    if (!segment.text.trim()) continue;

    let line = transcriptLines.get(segment.id);
    if (!line) {
      line = document.createElement("p");
      transcriptLines.set(segment.id, line);
      transcript.append(line);
    }

    const identity = participant?.identity?.toLowerCase() || "";
    const isLocalParticipant = participant?.identity === sourceRoom.localParticipant.identity;
    const isAssistant = sourceRoom === callMonitorRoom
      ? participant?.isAgent === true || identity.includes("agent") || identity.includes("assistant")
      : !isLocalParticipant;
    const speaker = isLocalParticipant ? "You" : isAssistant ? "Assistant" : "Caller";
    line.textContent = `[${new Date().toLocaleTimeString()}] ${speaker}: ${segment.text}`;
    if (sourceRoom === callMonitorRoom && isAssistant) {
      assistantResponseSegments.set(segment.id, segment.text.trim());
    }
  }

  transcript.scrollTop = transcript.scrollHeight;
}

async function pollCallStatus() {
  if (!activeRoomName) return;

  try {
    const response = await fetch(`/api/call-status?roomName=${encodeURIComponent(activeRoomName)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to read call status");

    if (data.requestUuid) requestId.textContent = data.requestUuid;
    if (data.serverResponse) displayServerResponse(data.serverResponse);
    setAnswered(data.answered, data.status === "calling");

    if (data.status === "in_progress") {
      setCallStatus("In Progress", "The call has been answered and connected to the assistant.");
      if (!callStartedAt && data.startedAt) {
        callStartedAt = data.startedAt;
        durationTimer = window.setInterval(updateDuration, 1000);
      }
    } else if (data.status === "failed") {
      setCallStatus("Failed", data.message || "The call could not be completed.");
      setAnswered(false);
      stopCallPolling();
      callMonitorRoom?.disconnect();
      startCallButton.disabled = false;
      startCallLabel.textContent = "Make a call";
    } else if (data.status === "ended") {
      callEndedAt = data.endedAt || Date.now();
      updateDuration();
      setCallStatus("Idle", "The call has ended. Your text response is shown below.");
      showCallResult();
      stopCallPolling();
      window.setTimeout(() => callMonitorRoom?.disconnect(), 1500);
      startCallButton.disabled = false;
      startCallLabel.textContent = "Make a call";
    } else {
      setCallStatus("Calling", "Plivo is placing the call. Waiting for an answer…");
    }
  } catch (error) {
    displayServerResponse({ error: error.message });
  }
}

function stopCallPolling() {
  window.clearTimeout(statusPollTimer);
  window.clearInterval(durationTimer);
  statusPollTimer = undefined;
  durationTimer = undefined;
  activeRoomName = "";
}

function scheduleCallStatusPoll() {
  statusPollTimer = window.setTimeout(async () => {
    await pollCallStatus();
    if (activeRoomName) scheduleCallStatusPoll();
  }, 1500);
}

async function connectCallMonitor(roomName) {
  const response = await fetch(`/api/call-monitor-token?roomName=${encodeURIComponent(roomName)}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const responseText = await response.text();
    if (response.status === 404 || responseText.trim() === "Not found") {
      throw new Error("The web server serving this page is outdated. Stop and restart `pnpm web`, then reload the dashboard.");
    }
    throw new Error(`Monitor endpoint returned an unexpected response (${response.status}).`);
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to monitor the call");

  callMonitorRoom = new Room();
  callMonitorRoom.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    showTranscript(segments, participant, callMonitorRoom);
  });
  await callMonitorRoom.connect(data.url, data.token);
}

room = new Room();
room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === Track.Kind.Audio) attachAudio(track);
});
room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
  showTranscript(segments, participant);
});
room.on(RoomEvent.LocalAudioSilenceDetected, () => {
  setStatus("Microphone is silent. Check the selected input device.", true);
});
room.on(RoomEvent.MediaDevicesError, (error) => {
  setStatus(`Microphone error: ${error.message}`, true);
});
room.on(RoomEvent.Disconnected, () => {
  connectButton.disabled = false;
  disconnectButton.disabled = true;
  setStatus("Disconnected");
});

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Connecting...");

  try {
    const response = await fetch("/token");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Token request failed");

    await room.connect(data.url, data.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    const microphone = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!microphone?.track) throw new Error("Microphone was not published");
    disconnectButton.disabled = false;
    setStatus(`Connected to ${data.room}. Microphone is live.`);
  } catch (error) {
    connectButton.disabled = false;
    setStatus(error.message, true);
  }
});

disconnectButton.addEventListener("click", () => room.disconnect());

callForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  startCallButton.disabled = true;
  startCallLabel.textContent = "Starting call…";
  setCallStatus("Calling", "Submitting your call request…");
  setAnswered(false, true);
  resetCallTranscript();
  requestId.textContent = "Waiting for Plivo…";
  serverResponse.textContent = "Submitting call request…";
  callStartedAt = undefined;
  callEndedAt = undefined;
  updateDuration();

  try {
    const response = await fetch("/api/make-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phoneNumber: phoneNumberInput.value,
        context: callContextInput.value,
      }),
    });
    const data = await response.json();
    displayServerResponse(data);
    if (!response.ok) throw new Error(data.error || "Call request failed");

    activeRoomName = data.roomName;
    requestId.textContent = data.requestUuid || data.roomName || "Unavailable";
    setCallStatus("Calling", "Plivo accepted the request. Waiting for an answer…");
    setCallFormMessage("Call request accepted. Status and answer updates will appear here.", false);
    startCallLabel.textContent = "Call in progress";
    try {
      await connectCallMonitor(activeRoomName);
    } catch (error) {
      setCallFormMessage(`Call started, but the live monitor could not connect: ${error.message}`, true);
    }
    await pollCallStatus();
    if (activeRoomName) scheduleCallStatusPoll();
  } catch (error) {
    setCallStatus("Failed", error.message);
    setAnswered(false);
    displayServerResponse({ error: error.message });
    setCallFormMessage(error.message, true);
    startCallButton.disabled = false;
    startCallLabel.textContent = "Make a call";
  }
});
