import test from "node:test";
import assert from "node:assert/strict";

import { resolveSpeechLanguage } from "../src/agent/agent.js";

test("speech language selection uses detected language metadata", () => {
  assert.deepEqual(resolveSpeechLanguage("en-US"), {
    language: "en",
    voice: "f6141af3-5f94-418c-80ed-a45d450e7e2e",
  });
  assert.deepEqual(resolveSpeechLanguage("hi-IN"), {
    language: "hi",
    voice: "32b0f12b-67c3-421d-8850-b46c019ced91",
  });
  assert.deepEqual(resolveSpeechLanguage("te-IN"), {
    language: "te",
    voice: "07bc462a-c644-49f1-baf7-82d5599131be",
  });
});

test("speech language selection falls back to transcript script", () => {
  assert.equal(resolveSpeechLanguage(null, "नमस्ते").language, "hi");
  assert.equal(resolveSpeechLanguage(null, "నమస్కారం").language, "te");
  assert.equal(resolveSpeechLanguage(null, "Hello there").language, "en");
});
