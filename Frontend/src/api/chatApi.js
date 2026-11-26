import { apiRequest } from "./authApi.js";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function fetchUsersList(search = "") {
  const query = search.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";
  return apiRequest(`/api/chat/users${query}`, {
    method: "GET",
  });
}

export function verifyUserEmail(email) {
  return apiRequest(
    `/api/chat/verify-user?email=${encodeURIComponent(email.trim())}`,
    {
      method: "GET",
    }
  );
}

export function fetchUserGroups() {
  return apiRequest("/api/chat/groups", {
    method: "GET",
  });
}

export function createNewGroup(name, memberEmails) {
  return apiRequest("/api/chat/groups", {
    method: "POST",
    body: JSON.stringify({ name, memberEmails }),
  });
}

export function removeMemberFromGroupApi(groupId, userId) {
  return apiRequest(`/api/chat/groups/${groupId}/members/${userId}`, {
    method: "DELETE",
  });
}

export function fetchAllMessages({ targetUserId = null, groupId = null } = {}) {
  const params = new URLSearchParams();
  if (groupId) params.set("groupId", String(groupId));
  else if (targetUserId) params.set("userId", String(targetUserId));
  const query = params.toString() ? `?${params.toString()}` : "";

  return apiRequest(`/api/chat/messages${query}`, {
    method: "GET",
  });
}

export async function postChatMessage(
  content,
  { receiverId = null, groupId = null, file = null, clientTempId = null } = {}
) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  if (content) formData.append("content", content);
  if (receiverId) formData.append("receiverId", String(receiverId));
  if (groupId) formData.append("groupId", String(groupId));
  if (clientTempId) formData.append("clientTempId", String(clientTempId));
  if (file) formData.append("media", file);

  const response = await fetch(`${API_BASE_URL}/api/chat/messages`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to send message");
  }
  return data;
}

export function deleteChatMessageApi(messageId, mode = "me") {
  return apiRequest(`/api/chat/messages/${messageId}/delete`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export function fetchAiSmartRepliesApi(recentContext, userStyle) {
  return apiRequest("/api/chat/ai/smart-replies", {
    method: "POST",
    body: JSON.stringify({ recentContext, userStyle }),
  });
}

export function fetchAiPredictiveApi(partialText, recentContext, userStyle) {
  return apiRequest("/api/chat/ai/predict", {
    method: "POST",
    body: JSON.stringify({ partialText, recentContext, userStyle }),
  });
}
