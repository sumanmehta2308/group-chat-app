import "../utils/setup.js";
import { io } from "socket.io-client";
import { getCurrentUser, logoutUser } from "../api/authApi.js";
import {
  fetchAllMessages,
  postChatMessage,
  fetchUsersList,
} from "../api/chatApi.js";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const currentUserAvatar = document.getElementById("currentUserAvatar");
const currentUserName = document.getElementById("currentUserName");
const activeChatAvatar = document.getElementById("activeChatAvatar");
const activeChatTitle = document.getElementById("activeChatTitle");
const activeChatStatus = document.getElementById("activeChatStatus");
const chatModeLabel = document.getElementById("chatModeLabel");
const chatSearchInput = document.getElementById("chatSearchInput");
const sidebarLastTime = document.getElementById("sidebarLastTime");
const sidebarLastPreview = document.getElementById("sidebarLastPreview");
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

let currentUser = null;
let recentContacts = [];
let displayedUsers = [];
let allMessages = [];
let selectedUser = null;
let currentRoomId = "global_group";
let socket = null;
let typingTimeout = null;
let searchDebounce = null;

function createPrivateRoomId(userId1, userId2) {
  const first = Math.min(Number(userId1), Number(userId2));
  const second = Math.max(Number(userId1), Number(userId2));
  return `private_${first}_${second}`;
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
  if (selectedUser) {
    return `${selectedUser.email} • Room: ${currentRoomId}`;
  }
  return currentUser
    ? `Connected as ${currentUser.name}`
    : "All verified members";
}

function getMessageTickHtml(msg) {
  if (msg.isRead) {
    return `<i class="bi bi-check2-all msg-status-icon seen" title="Seen"></i>`;
  }
  if (msg.isDelivered) {
    return `<i class="bi bi-check2-all msg-status-icon" title="Delivered"></i>`;
  }
  return `<i class="bi bi-check2 msg-status-icon" title="Sent"></i>`;
}

function renderUsersSidebar() {
  const isSearching = chatSearchInput.value.trim().length > 0;
  globalRoomItem.classList.toggle("active", selectedUser === null);

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

  if (existingIndex !== -1) {
    const existing = recentContacts[existingIndex];
    const updated = {
      ...existing,
      unreadCount: incrementUnread ? (existing.unreadCount || 0) + 1 : 0,
      lastMessage: lastMessageObj
        ? lastMessageObj.content
        : existing.lastMessage,
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
      lastMessage: lastMessageObj ? lastMessageObj.content : user.email,
      lastMessageTime: lastMessageObj ? lastMessageObj.createdAt : null,
    });
  }

  if (!chatSearchInput.value.trim()) {
    displayedUsers = [...recentContacts];
    renderUsersSidebar();
  }
}

function updateGroupSidebarPreview() {
  if (selectedUser !== null) return;
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
  sidebarLastPreview.textContent = `${senderPrefix}${last.content}`;
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
      const tickHtml = isOutgoing ? getMessageTickHtml(msg) : "";

      return `
        <div class="msg-row ${rowClass}">
          <div class="msg-bubble">
            ${senderHtml}
            <span class="msg-text">${escapeHtml(msg.content)}</span>
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
  if (!selectedUser) {
    return message.receiverId === null;
  }
  return (
    (message.senderId === currentUser.id &&
      message.receiverId === selectedUser.id) ||
    (message.senderId === selectedUser.id &&
      message.receiverId === currentUser.id)
  );
}

function emitMarkAsRead(roomId, senderId) {
  if (socket && socket.connected && roomId && senderId) {
    socket.emit("mark_as_read", {
      roomId,
      senderId: Number(senderId),
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

  if (selectedUser) {
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
    currentRoomId !== "global_group"
  ) {
    socket.emit("leave_room", { roomId: currentRoomId });
  }
}

async function selectGroupChat() {
  sessionStorage.removeItem("activeChatUserId");
  leavePreviousPrivateRoom();

  selectedUser = null;
  currentRoomId = "global_group";
  activeChatAvatar.textContent = "GC";
  activeChatTitle.textContent = "Group Chat Room";
  activeChatStatus.textContent = getDefaultStatusText();
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatModeLabel.textContent = "GROUP MESSAGES";
  chatAppShell.classList.remove("show-sidebar");

  renderUsersSidebar();
  await loadMessages(null);
}

async function selectPersonalChat(user) {
  sessionStorage.setItem("activeChatUserId", String(user.id));
  const nextRoomId = createPrivateRoomId(currentUser.id, user.id);
  if (currentRoomId !== nextRoomId) {
    leavePreviousPrivateRoom();
  }

  selectedUser = { ...user, unreadCount: 0 };
  currentRoomId = nextRoomId;
  activeChatAvatar.textContent = user.name.charAt(0).toUpperCase();
  activeChatTitle.textContent = user.name;
  activeChatStatus.textContent = getDefaultStatusText();
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatModeLabel.textContent = `PRIVATE CHAT • ${user.name.toUpperCase()}`;
  chatAppShell.classList.remove("show-sidebar");

  upsertRecentContact(selectedUser, null, false);

  if (socket && socket.connected) {
    socket.emit("join_room", {
      roomId: currentRoomId,
      targetUserId: user.id,
    });
    emitMarkAsRead(currentRoomId, user.id);
  }

  await loadMessages(user.id);
}

function connectSocket() {
  const token = localStorage.getItem("token");

  socket = io(API_BASE_URL, {
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
  });

  socket.on("authenticated", () => {
    activeChatStatus.textContent = getDefaultStatusText();
    if (selectedUser && currentRoomId !== "global_group") {
      socket.emit("join_room", {
        roomId: currentRoomId,
        targetUserId: selectedUser.id,
      });
      emitMarkAsRead(currentRoomId, selectedUser.id);
    }
  });

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
    if (selectedUser && data.isPrivate && data.userId === selectedUser.id) {
      activeChatStatus.textContent = "typing...";
      activeChatStatus.classList.add("text-success", "fw-semibold");
    } else if (!selectedUser && !data.isPrivate) {
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

async function loadMessages(targetUserId = null) {
  try {
    const res = await fetchAllMessages(targetUserId);
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

  if (selectedUser) {
    socket.emit("private_typing", {
      roomId: currentRoomId,
      targetUserId: selectedUser.id,
    });
  } else {
    socket.emit("typing");
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (!socket || !socket.connected) return;
    if (selectedUser) {
      socket.emit("private_stop_typing", {
        roomId: currentRoomId,
        targetUserId: selectedUser.id,
      });
    } else {
      socket.emit("stop_typing");
    }
  }, 1200);
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;

  try {
    sendBtn.disabled = true;

    if (socket && socket.connected) {
      if (selectedUser) {
        socket.emit("private_stop_typing", {
          roomId: currentRoomId,
          targetUserId: selectedUser.id,
        });
      } else {
        socket.emit("stop_typing");
      }
    }

    const res = await postChatMessage(
      content,
      selectedUser ? selectedUser.id : null
    );
    if (res.success && res.message) {
      appendIncomingMessage(res.message);
      if (selectedUser) {
        upsertRecentContact(selectedUser, res.message, false);
      }
      messageInput.value = "";
    }
  } catch (err) {
    alert(err.message || "Failed to send message");
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
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
    selectGroupChat();
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

  await loadRecentContacts();

  const savedUserId = sessionStorage.getItem("activeChatUserId");
  if (savedUserId) {
    const targetUser = recentContacts.find((u) => u.id === Number(savedUserId));
    if (targetUser) {
      connectSocket();
      await selectPersonalChat(targetUser);
      return;
    }
  }

  await loadMessages(null);
  connectSocket();
}

initDashboard();
