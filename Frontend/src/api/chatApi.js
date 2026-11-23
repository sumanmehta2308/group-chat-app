import { apiRequest } from "./authApi.js";

export function fetchAllMessages() {
  return apiRequest("/api/chat/messages", {
    method: "GET",
  });
}

export function postChatMessage(content) {
  return apiRequest("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}
