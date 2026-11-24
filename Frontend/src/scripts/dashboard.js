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
let allUsers = [];
let allMessages = [];
let selectedUser = null;
let socket = null;
let typingTimeout = null;

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
    return selectedUser.email;
  }
  return currentUser
    ? `Connected as ${currentUser.name}`
    : "All verified members";
}

function renderUsersSidebar(filterText = "") {
  const query = filterText.trim().toLowerCase();
  const filteredUsers = query
    ? allUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query)
      )
    : allUsers;

  globalRoomItem.classList.toggle("active", selectedUser === null);

  usersListContainer.innerHTML = filteredUsers
    .map((user) => {
      const isActive = selectedUser && selectedUser.id === user.id;
      const initial = user.name.charAt(0).toUpperCase();
      return `
        <div class="chat-item ${isActive ? "active" : ""}" data-user-id="${
        user.id
      }">
          <div class="chat-avatar">${escapeHtml(initial)}</div>
          <div class="chat-item-meta">
            <div class="chat-item-top">
              <span class="chat-item-name">${escapeHtml(user.name)}</span>
            </div>
            <div class="chat-item-preview">${escapeHtml(user.email)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  usersListContainer.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => {
      const userId = Number(item.dataset.userId);
      const user = allUsers.find((u) => u.id === userId);
      if (user) {
        selectPersonalChat(user);
      }
    });
  });
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
      const tickHtml = isOutgoing
        ? `<i class="bi bi-check2-all msg-status-icon"></i>`
        : "";

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

function appendIncomingMessage(message) {
  if (!isMessageForActiveChat(message)) return;

  const alreadyExists = allMessages.some((m) => m.id === message.id);
  if (alreadyExists) return;

  allMessages.push(message);
  updateGroupSidebarPreview();
  renderMessages();
}

async function selectGroupChat() {
  selectedUser = null;
  activeChatAvatar.textContent = "GC";
  activeChatTitle.textContent = "Group Chat Room";
  activeChatStatus.textContent = getDefaultStatusText();
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatModeLabel.textContent = "GROUP MESSAGES";
  chatAppShell.classList.remove("show-sidebar");

  renderUsersSidebar(chatSearchInput.value);
  await loadMessages(null);
}

async function selectPersonalChat(user) {
  selectedUser = user;
  activeChatAvatar.textContent = user.name.charAt(0).toUpperCase();
  activeChatTitle.textContent = user.name;
  activeChatStatus.textContent = user.email;
  activeChatStatus.classList.remove("text-success", "fw-semibold");
  chatModeLabel.textContent = `PRIVATE CHAT WITH ${user.name.toUpperCase()}`;
  chatAppShell.classList.remove("show-sidebar");

  if (socket && socket.connected) {
    socket.emit("join_room", { targetUserId: user.id });
  }

  renderUsersSidebar(chatSearchInput.value);
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
    if (selectedUser) {
      socket.emit("join_room", { targetUserId: selectedUser.id });
    }
  });

  socket.on("connect_error", (err) => {
    console.error("Socket auth failed:", err.message);
    activeChatStatus.textContent = "Authentication failed";
  });

  socket.on("new_message", (message) => {
    appendIncomingMessage(message);
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

async function loadUsers() {
  try {
    const res = await fetchUsersList();
    if (res.success) {
      allUsers = res.users || [];
      renderUsersSidebar(chatSearchInput.value);
    }
  } catch (err) {
    console.error("Failed to load users:", err.message);
  }
}

messageInput.addEventListener("input", () => {
  if (!socket || !socket.connected) return;

  if (selectedUser) {
    socket.emit("private_typing", { targetUserId: selectedUser.id });
  } else {
    socket.emit("typing");
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (!socket || !socket.connected) return;
    if (selectedUser) {
      socket.emit("private_stop_typing", { targetUserId: selectedUser.id });
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
        socket.emit("private_stop_typing", { targetUserId: selectedUser.id });
        socket.emit("new_message", {
          receiverId: selectedUser.id,
          content,
        });
        messageInput.value = "";
        return;
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

chatSearchInput.addEventListener("input", (e) => {
  renderUsersSidebar(e.target.value);
});

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

  await Promise.all([loadUsers(), loadMessages(null)]);
  connectSocket();
}

initDashboard();
