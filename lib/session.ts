import { generateUUID } from "./uuid";

const SESSION_KEY = "audio-shelf-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  let sessionId = localStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
}
