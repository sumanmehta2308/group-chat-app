import "../utils/setup.js";
import { io } from "socket.io-client";
import { getCurrentUser, logoutUser } from "../api/authApi.js";
import {
  fetchAllMessages,
  postChatMessage,
  fetchUsersList,
  verifyUserEmail,
  fetchUserGroups,
  createNewGroup,
} from "../api/chatApi.js";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const currentUserAvatar = document.getElementById("currentUserAvatar");
const currentUserName = document.getElementById("currentUserName");
const chatHeaderInfo = document.getElementById("chatHeaderInfo");
const activeChatAvatar = document.getElementById("activeChatAvatar");
const activeChatTitle = document.getElementById("activeChatTitle");
const activeChatStatus = document.getElementById("activeChatStatus");
const chatModeLabel = document.getElementById("chatModeLabel");
const chatSearchInput = document.getElementById("chatSearchInput");
const directEmailJoinForm = document.getElementById("directEmailJoinForm");
const sidebarLastTime = document.getElementById("sidebarLastTime");
const sidebarLastPreview = document.getElementById("sidebarLastPreview");
const groupsListContainer = document.getElementById("groupsListContainer");
const usersListContainer = document.getElementById("usersListContainer");
const messagesViewport = document.getElementById("messagesViewport");
const messagesContainer = document.getElementById("messagesContainer");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const scrollBottomBtn = document.getElementById("scrollBottomBtn");
const logoutBtn = document.getElementById("logoutBtn");
const mobileBackBtn = document.getElementById("mobileBackBtn");
const globalRoomItem = document.getElementById("globalRoomItem");
const chatAppShell = document.querySelector(".chat-app-shell");

const attachMediaBtn = document.getElementById("attachMediaBtn");
const mediaFileInput = document.getElementById("mediaFileInput");
const selectedFileBar = document.getElementById("selectedFileBar");
const selectedFileName = document.getElementById("selectedFileName");
const clearSelectedFileBtn = document.getElementById("clearSelectedFileBtn");
const selectedFilePreviewThumb = document.getElementById(
  "selectedFilePreviewThumb"
);
const selectedFileMeta = document.getElementById("selectedFileMeta");
const openCreateGroupBtn = document.getElementById("openCreateGroupBtn");
const createGroupModal = document.getElementById("createGroupModal");
const closeCreateGroupBtn = document.getElementById("closeCreateGroupBtn");
const cancelCreateGroupBtn = document.getElementById("cancelCreateGroupBtn");
const createGroupForm = document.getElementById("createGroupForm");
const groupNameInput = document.getElementById("groupNameInput");
const groupMembersInput = document.getElementById("groupMembersInput");

const groupMembersModal = document.getElementById("groupMembersModal");
const closeGroupMembersBtn = document.getElementById("closeGroupMembersBtn");
const modalGroupName = document.getElementById("modalGroupName");
const modalGroupCount = document.getElementById("modalGroupCount");
const groupMembersList = document.getElementById("groupMembersList");

let currentUser = null;
let userGroups = [];
let recentContacts = [];
let displayedUsers = [];
let allMessages = [];
let selectedUser = null;
let selectedGroup = null;
let selectedFile = null;
let currentRoomId = "global_group";
let socket = null;
let typingTimeout = null;
let searchDebounce = null;

function createPrivateRoomIdByEmail(email1, email2) {
  const sorted = [
    String(email1).trim().toLowerCase(),
    String(email2).trim().toLowerCase(),
  ].sort();
  return `private_${sorted[0]}_${sorted[1]}`;
}

function formatTimestamp(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  messagesViewport.scrollTop = messagesViewport.scrollHeight;
  scrollBottomBtn.classList.add("d-none");
}

function getDefaultStatusText() {
  if (selectedGroup) {
    return `${
      selectedGroup.memberCount || 1
    } members • Click header to view members`;
  }
  if (selectedUser) {
    return `${selectedUser.email} • Room: ${currentRoomId}`;
  }
  return currentUser
    ? `Connected as ${currentUser.name}`
    : "All verified members";
}

function getMessageTickHtml(msg) {
  if (!selectedGroup && !selectedUser) {
    return `<i class="bi bi-check2-all msg-status-icon seen"></i>`;
  }
  if (msg.isRead) {
    return `<i class="bi bi-check2-all msg-status-icon seen" title="Seen by all"></i>`;
  }
  if (msg.isDelivered) {
    return `<i class="bi bi-check2-all msg-status-icon" title="Delivered"></i>`;
  }
  return `<i class="bi bi-check2 msg-status-icon" title="Sent"></i>`;
}

function renderMediaContentHtml(msg) {
  if (!msg.mediaUrl) return "";
  const safeUrl = escapeHtml(msg.mediaUrl);
  const safeName = escapeHtml(msg.fileName || "Attachment");

  if (msg.mediaType === "image") {
    return `
      <div class="mb-1">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">
          <img
            src="${safeUrl}"
            alt="${safeName}"
            class="img-fluid rounded"
            style="max-height: 240px; object-fit: cover; cursor: pointer;"
          />
        </a>
      </div>
    `;
  }

  if (msg.mediaType === "video") {
    return `
      <div class="mb-1">
        <video
          src="${safeUrl}"
          controls
          class="rounded w-100"
          style="max-height: 240px;"
        ></video>
      </div>
    `;
  }

  return `
    <div class="mb-1 p-2 rounded border bg-white d-flex align-items-center justify-content-between gap-2">
      <div class="small text-truncate text-dark">
        <i class="bi bi-file-earmark-arrow-down-fill text-success me-1"></i>
        ${safeName}
      </div>
      <a
        href="${safeUrl}"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-sm btn-outline-success py-0 px-2"
      >
        Open
      </a>
    </div>
  `;
}

function renderGroupsSidebar() {
  if (userGroups.length === 0) {
    groupsListContainer.innerHTML = "";
    return;
  }

  groupsListContainer.innerHTML = userGroups
    .map((group) => {
      const isActive = selectedGroup && selectedGroup.id === group.id;
      const initial = group.name.charAt(0).toUpperCase();
      return `
        <div class="chat-item ${isActive ? "active" : ""}" data-group-id="${
        group.id
      }">
          <div class="chat-avatar" style="background-color: #008069;">${escapeHtml(
            initial
          )}</div>
          <div class="chat-item-meta">
            <div class="chat-item-top">
              <span class="chat-item-name">${escapeHtml(group.name)}</span>
              <span class="badge bg-light text-dark border" style="font-size: 10px;">Group</span>
            </div>
            <div class="chat-item-preview">${
              group.memberCount || 1
            } members</div>
          </div>
        </div>
      `;
    })
    .join("");

  groupsListContainer.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => {
      const groupId = Number(item.dataset.groupId);
      const group = userGroups.find((g) => g.id === groupId);
      if (group) {
        selectCustomGroupChat(group);
      }
    });
  });
}

function renderUsersSidebar() {
  const isSearching = chatSearchInput.value.trim().length > 0;
  globalRoomItem.classList.toggle(
    "active",
    selectedUser === null && selectedGroup === null
  );

  renderGroupsSidebar();

  if (displayedUsers.length === 0 && isSearching) {
    usersListContainer.innerHTML = `
      <div class="text-center text-muted small py-3 px-2">
        No registered user found for "${escapeHtml(
          chatSearchInput.value.trim()
        )}"
      </div>
    `;
    return;
  }

  usersListContainer.innerHTML = displayedUsers
    .map((user) => {
      const isActive = selectedUser && selectedUser.id === user.id;
      const initial = user.name.charAt(0).toUpperCase();
      const unreadCount = !isActive && user.unreadCount ? user.unreadCount : 0;
      const badgeHtml =
        unreadCount > 0
          ? `<span class="unread-badge">${unreadCount}</span>`
          : "";
      const timeHtml = user.lastMessageTime
        ? `<span class="chat-item-time">${escapeHtml(
            formatTimestamp(user.lastMessageTime)
          )}</span>`
        : "";
      const previewText = user.lastMessage || user.email;

      return `
        <div class="chat-item ${isActive ? "active" : ""}" data-user-id="${
        user.id
      }">
          <div class="chat-avatar">${escapeHtml(initial)}</div>
          <div class="chat-item-meta">
            <div class="chat-item-top">
              <span class="chat-item-name">${escapeHtml(user.name)}</span>
              ${timeHtml}
            </div>
            <div class="d-flex align-items-center justify-content-between">
              <div class="chat-item-preview ${
                unreadCount > 0 ? "fw-semibold text-dark" : ""
              }">${escapeHtml(previewText)}</div>
              ${badgeHtml}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  usersListContainer.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => {
      const userId = Number(item.dataset.userId);
      const user = displayedUsers.find((u) => u.id === userId);
      if (user) {
        selectPersonalChat(user);
      }
    });
  });
}

function upsertRecentContact(
  user,
  lastMessageObj = null,
  incrementUnread = false
) {
  if (!user) return;
  const existingIndex = recentContacts.findIndex((u) => u.id === user.id);
  const previewLabel = lastMessageObj
    ? lastMessageObj.content || `📎 ${lastMessageObj.fileName || "Media"}`
    : null;

  if (existingIndex !== -1) {
    const existing = recentContacts[existingIndex];
    const updated = {
      ...existing,
      unreadCount: incrementUnread ? (existing.unreadCount || 0) + 1 : 0,
      lastMessage: previewLabel || existing.lastMessage,
      lastMessageTime: lastMessageObj
        ? lastMessageObj.createdAt
        : existing.lastMessageTime,
    };
    recentContacts.splice(existingIndex, 1);
    recentContacts.unshift(updated);
  } else {
    recentContacts.unshift({
      id: user.id,
      name: user.name,
      email: user.email,
      unreadCount: incrementUnread ? 1 : 0,
      lastMessage: previewLabel || user.email,
      lastMessageTime: lastMessageObj ? lastMessageObj.createdAt : null,
    });
  }

  if (!chatSearchInput.value.trim()) {
    displayedUsers = [...recentContacts];
    renderUsersSidebar();
  }
}

function updateGroupSidebarPreview() {
  if (selectedUser !== null || selectedGroup !== null) return;
  if (allMessages.length === 0) {
    sidebarLastPreview.textContent = "Global group chat";
    sidebarLastTime.textContent = "";
    return;
  }

  const last = allMessages[allMessages.length - 1];
  const isOutgoing = last.senderId === currentUser.id;
  const senderPrefix = isOutgoing
    ? "You: "
    : `${last.sender?.name || "User"}: `;
  const bodyPreview = last.content || `📎 ${last.fileName || "Media"}`;
  sidebarLastPreview.textContent = `${senderPrefix}${bodyPreview}`;
  sidebarLastTime.textContent = formatTimestamp(last.createdAt);
}

function renderMessages() {
  if (allMessages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="text-center text-muted small my-4">
        No messages yet. Start the conversation!
      </div>
    `;
    return;
  }

  messagesContainer.innerHTML = allMessages
    .map((msg) => {
      const isOutgoing = msg.senderId === currentUser.id;
      const rowClass = isOutgoing ? "outgoing" : "incoming";
      const senderHtml =
        !isOutgoing && !selectedUser
          ? `<div class="msg-sender">${escapeHtml(
              msg.sender?.name || "Unknown"
            )}</div>`
          : "";
      const mediaHtml = renderMediaContentHtml(msg);
      const textHtml = msg.content
        ? `<span class="msg-text">${escapeHtml(msg.content)}</span>`
        : "";
      const tickHtml = isOutgoing ? getMessageTickHtml(msg) : "";

      return `
        <div class="msg-row ${rowClass}">
          <div class="msg-bubble">
            ${senderHtml}
            ${mediaHtml}
            ${textHtml}
            <span class="msg-meta">
              <span>${escapeHtml(formatTimestamp(msg.createdAt))}</span>
              ${tickHtml}
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  scrollToBottom();
}

function isMessageForActiveChat(message) {
  if (selectedGroup) {
    return Number(message.groupId) === Number(selectedGroup.id);
  }
  if (selectedUser) {
    return (
      !message.groupId &&
      ((message.senderId === currentUser.id &&
        message.receiverId === selectedUser.id) ||
        (message.senderId === selectedUser.id &&
          message.receiverId === currentUser.id))
    );
  }
  return message.receiverId === null && message.groupId === null;
}

function emitMarkAsRead(roomId, senderId) {
  if (socket && socket.connected && roomId && senderId) {
    socket.emit("mark_as_read", {
      roomId,
      senderId: Number(senderId),
    });
  }
}

function emitMarkGroupAsRead(groupId) {
  if (socket && socket.connected && groupId) {
    socket.emit("mark_group_read", {
      groupId: Number(groupId),
    });
  }
}

function appendIncomingMessage(message) {
  if (!isMessageForActiveChat(message)) return;

  const alreadyExists = allMessages.some((m) => m.id === message.id);
  if (alreadyExists) return;

  allMessages.push(message);
  updateGroupSidebarPreview();
  renderMessages();

  if (selectedGroup && message.senderId !== currentUser.id) {
    emitMarkGroupAsRead(selectedGroup.id);
  } else if (selectedUser) {
    upsertRecentContact(selectedUser, message, false);
    if (message.senderId === selectedUser.id) {
      emitMarkAsRead(currentRoomId, selectedUser.id);
    }
  }
}

function leavePreviousPrivateRoom() {
  if (
    socket &&
    socket.connected &&
    currentRoomId &&
    currentRoomId.startsWith("private_")
  ) {
    socket.emit("leave_room", { roomId: currentRoomId });
  }
}

async function selectGlobalGroupChat() {
  sessionStorage.removeItem("activeChatState");
  leavePreviousPrivateRoom();

  selectedUser = null;
  selectedGroup = null;
  currentRoomId = "global_group";
  activeChatAvatar.textContent = "GC";
  activeChatTitle.textContent = "Group Chat Room";
  activeChatStatus.textContent = getDefaultStatusText();
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatHeaderInfo.style.cursor = "default";
  chatModeLabel.textContent = "GLOBAL GROUP MESSAGES";
  chatAppShell.classList.remove("show-sidebar");

  renderUsersSidebar();
  await loadMessages({});
}

async function selectCustomGroupChat(group) {
  sessionStorage.setItem(
    "activeChatState",
    JSON.stringify({ type: "group", id: group.id })
  );
  leavePreviousPrivateRoom();

  selectedUser = null;
  selectedGroup = group;
  currentRoomId = `group_${group.id}`;
  activeChatAvatar.textContent = group.name.charAt(0).toUpperCase();
  activeChatTitle.textContent = group.name;
  activeChatStatus.textContent = getDefaultStatusText();
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatHeaderInfo.style.cursor = "pointer";
  chatModeLabel.textContent = `GROUP • ${group.name.toUpperCase()}`;
  chatAppShell.classList.remove("show-sidebar");

  if (socket && socket.connected) {
    socket.emit("join_group_room", { groupId: group.id });
    emitMarkGroupAsRead(group.id);
  }

  renderUsersSidebar();
  await loadMessages({ groupId: group.id });
}

async function selectPersonalChat(user) {
  sessionStorage.setItem(
    "activeChatState",
    JSON.stringify({ type: "user", id: user.id })
  );
  const nextRoomId = createPrivateRoomIdByEmail(currentUser.email, user.email);
  if (currentRoomId !== nextRoomId) {
    leavePreviousPrivateRoom();
  }

  selectedGroup = null;
  selectedUser = { ...user, unreadCount: 0 };
  currentRoomId = nextRoomId;
  activeChatAvatar.textContent = user.name.charAt(0).toUpperCase();
  activeChatTitle.textContent = user.name;
  activeChatStatus.textContent = getDefaultStatusText();
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatHeaderInfo.style.cursor = "default";
  chatModeLabel.textContent = `PRIVATE CHAT • ${user.name.toUpperCase()}`;
  chatAppShell.classList.remove("show-sidebar");

  upsertRecentContact(selectedUser, null, false);

  if (socket && socket.connected) {
    socket.emit("join_room", {
      roomId: currentRoomId,
      targetEmail: user.email,
    });
    emitMarkAsRead(currentRoomId, user.id);
  }

  await loadMessages({ targetUserId: user.id });
}

function openGroupMembersModal() {
  if (!selectedGroup) return;
  modalGroupName.textContent = selectedGroup.name;
  const members = selectedGroup.members || [];
  modalGroupCount.textContent = `${members.length} members`;

  groupMembersList.innerHTML = members
    .map((m) => {
      const isAdmin = Number(m.id) === Number(selectedGroup.createdBy);
      const isYou = Number(m.id) === Number(currentUser.id);
      return `
        <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
          <div class="d-flex align-items-center gap-2 overflow-hidden">
            <div class="chat-avatar" style="width: 36px; height: 36px; font-size: 14px;">
              ${escapeHtml(m.name.charAt(0).toUpperCase())}
            </div>
            <div class="overflow-hidden">
              <div class="fw-semibold small text-truncate">
                ${escapeHtml(m.name)} ${isYou ? "(You)" : ""}
              </div>
              <div class="text-muted text-truncate" style="font-size: 12px;">
                ${escapeHtml(m.email)}
              </div>
            </div>
          </div>
          ${
            isAdmin
              ? `<span class="badge bg-success-subtle text-success border border-success-subtle">Admin</span>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  groupMembersModal.classList.remove("d-none");
  groupMembersModal.classList.add("d-flex");
}

function closeGroupMembersModal() {
  groupMembersModal.classList.add("d-none");
  groupMembersModal.classList.remove("d-flex");
}

chatHeaderInfo.addEventListener("click", (e) => {
  if (e.target.closest("#mobileBackBtn")) return;
  if (selectedGroup) {
    openGroupMembersModal();
  }
});

closeGroupMembersBtn.addEventListener("click", closeGroupMembersModal);

function connectSocket() {
  const token = localStorage.getItem("token");

  socket = io(API_BASE_URL, {
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
  });

  socket.on("authenticated", () => {
    activeChatStatus.textContent = getDefaultStatusText();
    if (selectedUser && currentRoomId.startsWith("private_")) {
      socket.emit("join_room", {
        roomId: currentRoomId,
        targetEmail: selectedUser.email,
      });
      emitMarkAsRead(currentRoomId, selectedUser.id);
    } else if (selectedGroup) {
      socket.emit("join_group_room", { groupId: selectedGroup.id });
      emitMarkGroupAsRead(selectedGroup.id);
    }
  });

  socket.on("room_error", ({ message }) => {
    alert(message || "Unable to join private room");
  });

  socket.on("group_created", (newGroup) => {
    const exists = userGroups.some((g) => g.id === newGroup.id);
    if (!exists) {
      userGroups.unshift(newGroup);
      renderUsersSidebar();
    }
    if (socket && socket.connected) {
      socket.emit("join_group_room", { groupId: newGroup.id });
    }
  });

  socket.on(
    "group_message_status_updated",
    ({ messageId, groupId, isDelivered, isRead }) => {
      if (!selectedGroup || Number(selectedGroup.id) !== Number(groupId))
        return;
      const msg = allMessages.find((m) => Number(m.id) === Number(messageId));
      if (msg) {
        msg.isDelivered = isDelivered;
        msg.isRead = isRead;
        renderMessages();
      }
    }
  );

  socket.on("messages_delivered", ({ roomId }) => {
    if (roomId !== currentRoomId) return;
    allMessages.forEach((m) => {
      if (m.senderId === currentUser.id) {
        m.isDelivered = true;
      }
    });
    renderMessages();
  });

  socket.on("messages_read", ({ roomId }) => {
    if (roomId !== currentRoomId) return;
    allMessages.forEach((m) => {
      if (m.senderId === currentUser.id) {
        m.isDelivered = true;
        m.isRead = true;
      }
    });
    renderMessages();
  });

  socket.on("connect_error", (err) => {
    console.error("Socket auth failed:", err.message);
    activeChatStatus.textContent = "Authentication failed";
  });

  socket.on("new_message", (message) => {
    appendIncomingMessage(message);
  });

  socket.on("contact_updated", async (message) => {
    if (selectedUser && message.senderId === selectedUser.id) {
      return;
    }

    if (message.sender) {
      upsertRecentContact(message.sender, message, true);
    } else if (!chatSearchInput.value.trim()) {
      await loadRecentContacts();
    }
  });

  socket.on("user_typing", (data) => {
    if (data.userId === currentUser.id) return;
    if (
      selectedGroup &&
      data.isGroup &&
      Number(data.groupId) === Number(selectedGroup.id)
    ) {
      activeChatStatus.textContent = `${data.name} is typing...`;
      activeChatStatus.classList.add("text-success", "fw-semibold");
    } else if (
      selectedUser &&
      data.isPrivate &&
      data.roomId === currentRoomId
    ) {
      activeChatStatus.textContent = "typing...";
      activeChatStatus.classList.add("text-success", "fw-semibold");
    } else if (
      !selectedUser &&
      !selectedGroup &&
      !data.isPrivate &&
      !data.isGroup
    ) {
      activeChatStatus.textContent = `${data.name} is typing...`;
      activeChatStatus.classList.add("text-success", "fw-semibold");
    }
  });

  socket.on("user_stop_typing", () => {
    activeChatStatus.textContent = getDefaultStatusText();
    activeChatStatus.classList.remove("text-success", "fw-semibold");
  });

  socket.on("disconnect", () => {
    activeChatStatus.textContent = "Reconnecting...";
  });
}

async function loadMessages(filter = {}) {
  try {
    const res = await fetchAllMessages(filter);
    if (res.success) {
      allMessages = res.messages || [];
      updateGroupSidebarPreview();
      renderMessages();
    }
  } catch (err) {
    console.error("Failed to load messages:", err.message);
  }
}

async function loadRecentContacts() {
  try {
    const res = await fetchUsersList("");
    if (res.success) {
      recentContacts = res.users || [];
      if (!chatSearchInput.value.trim()) {
        displayedUsers = [...recentContacts];
        renderUsersSidebar();
      }
    }
  } catch (err) {
    console.error("Failed to load contacts:", err.message);
  }
}

async function loadGroups() {
  try {
    const res = await fetchUserGroups();
    if (res.success) {
      userGroups = res.groups || [];
      renderUsersSidebar();
    }
  } catch (err) {
    console.error("Failed to load groups:", err.message);
  }
}

attachMediaBtn.addEventListener("click", () => {
  mediaFileInput.click();
});

mediaFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;
  selectedFileName.textContent = file.name;
  const sizeKB = (file.size / 1024).toFixed(1);
  selectedFileMeta.textContent = `${file.type || "Document"} • ${sizeKB} KB`;

  if (file.type.startsWith("image/")) {
    const previewUrl = URL.createObjectURL(file);
    selectedFilePreviewThumb.innerHTML = `<img src="${previewUrl}" alt="preview" style="width: 100%; height: 100%; object-fit: cover;" />`;
  } else if (file.type.startsWith("video/")) {
    selectedFilePreviewThumb.innerHTML = `<i class="bi bi-camera-video-fill fs-4 text-primary"></i>`;
  } else {
    selectedFilePreviewThumb.innerHTML = `<i class="bi bi-file-earmark-pdf-fill fs-4 text-danger"></i>`;
  }

  selectedFileBar.classList.remove("d-none");
});

function clearSelectedMedia() {
  selectedFile = null;
  mediaFileInput.value = "";
  selectedFileBar.classList.add("d-none");
}

clearSelectedFileBtn.addEventListener("click", clearSelectedMedia);

directEmailJoinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = chatSearchInput.value.trim();
  if (!email) return;

  try {
    const res = await verifyUserEmail(email);
    if (res.success && res.user) {
      chatSearchInput.value = "";
      await selectPersonalChat(res.user);
    }
  } catch (err) {
    alert(err.message || "Invalid or unregistered email address");
  }
});

chatSearchInput.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchDebounce);

  if (!query) {
    displayedUsers = [...recentContacts];
    renderUsersSidebar();
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetchUsersList(query);
      if (res.success) {
        displayedUsers = res.users || [];
        renderUsersSidebar();
      }
    } catch (err) {
      console.error("Search failed:", err.message);
    }
  }, 300);
});

messageInput.addEventListener("input", () => {
  if (!socket || !socket.connected) return;

  if (selectedGroup) {
    socket.emit("group_typing", { groupId: selectedGroup.id });
  } else if (selectedUser) {
    socket.emit("private_typing", { roomId: currentRoomId });
  } else {
    socket.emit("typing");
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (!socket || !socket.connected) return;
    if (selectedGroup) {
      socket.emit("group_stop_typing", { groupId: selectedGroup.id });
    } else if (selectedUser) {
      socket.emit("private_stop_typing", { roomId: currentRoomId });
    } else {
      socket.emit("stop_typing");
    }
  }, 1200);
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content && !selectedFile) return;

  const fileToSend = selectedFile;
  const tempId = `temp_${Date.now()}`;
  const optimisticUrl = fileToSend ? URL.createObjectURL(fileToSend) : null;
  const optimisticType = fileToSend
    ? fileToSend.type.startsWith("image/")
      ? "image"
      : fileToSend.type.startsWith("video/")
      ? "video"
      : "file"
    : null;

  const optimisticMsg = {
    id: tempId,
    senderId: currentUser.id,
    receiverId: selectedUser ? selectedUser.id : null,
    groupId: selectedGroup ? selectedGroup.id : null,
    content,
    mediaUrl: optimisticUrl,
    mediaType: optimisticType,
    fileName: fileToSend ? fileToSend.name : null,
    isDelivered: false,
    isRead: false,
    createdAt: new Date().toISOString(),
    sender: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
    },
  };

  allMessages.push(optimisticMsg);
  renderMessages();
  messageInput.value = "";
  clearSelectedMedia();

  try {
    if (socket && socket.connected) {
      if (selectedGroup) {
        socket.emit("group_stop_typing", { groupId: selectedGroup.id });
      } else if (selectedUser) {
        socket.emit("private_stop_typing", { roomId: currentRoomId });
      } else {
        socket.emit("stop_typing");
      }
    }

    const res = await postChatMessage(content, {
      receiverId: selectedUser ? selectedUser.id : null,
      groupId: selectedGroup ? selectedGroup.id : null,
      file: fileToSend,
    });

    allMessages = allMessages.filter((m) => m.id !== tempId);
    if (res.success && res.message) {
      appendIncomingMessage(res.message);
      if (selectedUser) {
        upsertRecentContact(selectedUser, res.message, false);
      }
    }
  } catch (err) {
    allMessages = allMessages.filter((m) => m.id !== tempId);
    renderMessages();
    alert(err.message || "Failed to send message");
  } finally {
    messageInput.focus();
  }
});

function toggleGroupModal(show) {
  if (show) {
    createGroupModal.classList.remove("d-none");
    createGroupModal.classList.add("d-flex");
    groupNameInput.focus();
  } else {
    createGroupModal.classList.add("d-none");
    createGroupModal.classList.remove("d-flex");
    createGroupForm.reset();
  }
}

openCreateGroupBtn.addEventListener("click", () => toggleGroupModal(true));
closeCreateGroupBtn.addEventListener("click", () => toggleGroupModal(false));
cancelCreateGroupBtn.addEventListener("click", () => toggleGroupModal(false));

createGroupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = groupNameInput.value.trim();
  const rawEmails = groupMembersInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!name) return;

  try {
    const res = await createNewGroup(name, rawEmails);
    if (res.success && res.group) {
      toggleGroupModal(false);
      const exists = userGroups.some((g) => g.id === res.group.id);
      if (!exists) {
        userGroups.unshift(res.group);
      }
      await selectCustomGroupChat(res.group);
    }
  } catch (err) {
    alert(err.message || "Failed to create group");
  }
});

messagesViewport.addEventListener("scroll", () => {
  const distanceFromBottom =
    messagesViewport.scrollHeight -
    messagesViewport.scrollTop -
    messagesViewport.clientHeight;
  scrollBottomBtn.classList.toggle("d-none", distanceFromBottom < 120);
});

scrollBottomBtn.addEventListener("click", scrollToBottom);

if (globalRoomItem) {
  globalRoomItem.addEventListener("click", () => {
    selectGlobalGroupChat();
  });
}

if (mobileBackBtn) {
  mobileBackBtn.addEventListener("click", () => {
    chatAppShell.classList.add("show-sidebar");
  });
}

logoutBtn.addEventListener("click", async () => {
  if (socket) socket.disconnect();
  try {
    await logoutUser();
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
  window.location.replace("/src/pages/login.html");
});

async function initDashboard() {
  try {
    const res = await getCurrentUser();
    if (res.success && res.user) {
      currentUser = res.user;
      localStorage.setItem("user", JSON.stringify(res.user));
    } else {
      window.location.replace("/src/pages/login.html");
      return;
    }
  } catch {
    window.location.replace("/src/pages/login.html");
    return;
  }

  currentUserName.textContent = currentUser.name;
  currentUserAvatar.textContent = currentUser.name.charAt(0).toUpperCase();

  await Promise.all([loadGroups(), loadRecentContacts()]);

  const savedRaw = sessionStorage.getItem("activeChatState");
  if (savedRaw) {
    try {
      const saved = JSON.parse(savedRaw);
      if (saved.type === "group") {
        const targetGroup = userGroups.find((g) => g.id === Number(saved.id));
        if (targetGroup) {
          connectSocket();
          await selectCustomGroupChat(targetGroup);
          return;
        }
      } else if (saved.type === "user") {
        const targetUser = recentContacts.find(
          (u) => u.id === Number(saved.id)
        );
        if (targetUser) {
          connectSocket();
          await selectPersonalChat(targetUser);
          return;
        }
      }
    } catch {
      sessionStorage.removeItem("activeChatState");
    }
  }

  await loadMessages({});
  connectSocket();
}

initDashboard();
