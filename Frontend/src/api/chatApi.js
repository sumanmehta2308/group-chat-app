import { apiRequest } from "./authApi.js";

export function fetchUsersList(search = "") {
  const query = search.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";
  return apiRequest(`/api/chat/users${query}`, {
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
