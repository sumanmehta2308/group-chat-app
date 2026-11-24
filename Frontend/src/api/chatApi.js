import { apiRequest } from "./authApi.js";

export function fetchUsersList() {
  return apiRequest("/api/chat/users", {
    method: "GET",
  });
}

export function fetchAllMessages(targetUserId = null) {
  const query = targetUserId ? `?userId=${targetUserId}` : "";
  return apiRequest(`/api/chat/messages${query}`, {
    method: "GET",
  });
}

export function postChatMessage(content, receiverId = null) {
  return apiRequest("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({ content, receiverId }),
  });
}
