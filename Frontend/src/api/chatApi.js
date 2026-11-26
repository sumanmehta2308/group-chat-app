import { apiRequest } from "./authApi.js";

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

export function fetchAllMessages({ targetUserId = null, groupId = null } = {}) {
  const params = new URLSearchParams();
  if (groupId) params.set("groupId", String(groupId));
  else if (targetUserId) params.set("userId", String(targetUserId));
  const query = params.toString() ? `?${params.toString()}` : "";

  return apiRequest(`/api/chat/messages${query}`, {
    method: "GET",
  });
}

export function postChatMessage(
  content,
  { receiverId = null, groupId = null } = {}
) {
  return apiRequest("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({ content, receiverId, groupId }),
  });
}
