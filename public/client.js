import { Room, RoomEvent, Track } from "https://cdn.jsdelivr.net/npm/livekit-client@2.22.3/+esm";

const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");
const status = document.querySelector("#status");
const transcript = document.querySelector("#transcript");
const transcriptLines = new Map();
let room;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.className = isError ? "error" : "";
}

function attachAudio(track) {
  const element = track.attach();
  element.autoplay = true;
  element.setAttribute("data-livekit-audio", "true");
  document.body.append(element);
}

function showTranscript(segments, participant) {
  const previousPlaceholder = transcript.querySelector("p");
  if (previousPlaceholder?.textContent === "No speech detected yet.") {
    previousPlaceholder.remove();
  }

  for (const segment of segments) {
    if (!segment.text.trim()) continue;

    let line = transcriptLines.get(segment.id);
    if (!line) {
      line = document.createElement("p");
      transcriptLines.set(segment.id, line);
      transcript.append(line);
    }

    const speaker = participant?.identity === room.localParticipant.identity
      ? "You"
      : "Assistant";
    line.textContent = `${speaker}: ${segment.text}`;
  }

  transcript.scrollTop = transcript.scrollHeight;
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
    setStatus(`Connected to ${data.room}. Microphone is live.`, false);
  } catch (error) {
    connectButton.disabled = false;
    setStatus(error.message, true);
  }
});

disconnectButton.addEventListener("click", () => room.disconnect());
