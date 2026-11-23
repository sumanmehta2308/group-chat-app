import "../utils/setup.js";
import { io } from "socket.io-client";
import { getCurrentUser, logoutUser } from "../api/authApi.js";
import { fetchAllMessages, postChatMessage } from "../api/chatApi.js";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const currentUserAvatar = document.getElementById("currentUserAvatar");
const currentUserName = document.getElementById("currentUserName");
const activeChatStatus = document.getElementById("activeChatStatus");
const chatSearchInput = document.getElementById("chatSearchInput");
const sidebarLastTime = document.getElementById("sidebarLastTime");
const sidebarLastPreview = document.getElementById("sidebarLastPreview");
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
let allMessages = [];
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

function updateSidebarPreview() {
  if (allMessages.length === 0) {
    sidebarLastPreview.textContent = "No messages yet. Say hi!";
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

function renderMessages(filterText = "") {
  const query = filterText.trim().toLowerCase();
  const filtered = query
    ? allMessages.filter(
        (m) =>
          m.content.toLowerCase().includes(query) ||
          (m.sender?.name || "").toLowerCase().includes(query)
      )
    : allMessages;

  if (filtered.length === 0) {
    messagesContainer.innerHTML = `
      <div class="text-center text-muted small my-4">
        ${
          query
            ? "No matching messages found."
            : "No messages yet. Start the conversation!"
        }
      </div>
    `;
    return;
  }

  messagesContainer.innerHTML = filtered
    .map((msg) => {
      const isOutgoing = msg.senderId === currentUser.id;
      const rowClass = isOutgoing ? "outgoing" : "incoming";
      const senderHtml = !isOutgoing
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

function appendIncomingMessage(message) {
  const alreadyExists = allMessages.some((m) => m.id === message.id);
  if (alreadyExists) return;

  allMessages.push(message);
  updateSidebarPreview();
  renderMessages(chatSearchInput.value);
}

function connectSocket() {
  const token = localStorage.getItem("token");
  socket = io(API_BASE_URL, {
    auth: { token },
    withCredentials: true,
  });

  socket.on("new_message", (message) => {
    appendIncomingMessage(message);
  });

  socket.on("user_typing", (data) => {
    if (activeChatStatus && data.userId !== currentUser.id) {
      activeChatStatus.textContent = `${data.name} is typing...`;
      activeChatStatus.classList.add("text-success", "fw-semibold");
    }
  });

  socket.on("user_stop_typing", () => {
    if (activeChatStatus) {
      activeChatStatus.textContent = "All verified members";
      activeChatStatus.classList.remove("text-success", "fw-semibold");
    }
  });
}

async function loadMessages() {
  try {
    const res = await fetchAllMessages();
    if (res.success) {
      allMessages = res.messages || [];
      updateSidebarPreview();
      renderMessages(chatSearchInput.value);
    }
  } catch (err) {
    console.error("Failed to load messages:", err.message);
  }
}

messageInput.addEventListener("input", () => {
  if (!socket) return;
  socket.emit("typing");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop_typing");
  }, 1200);
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;

  try {
    sendBtn.disabled = true;
    if (socket) socket.emit("stop_typing");

    const res = await postChatMessage(content);
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
  renderMessages(e.target.value);
});

if (globalRoomItem) {
  globalRoomItem.addEventListener("click", () => {
    chatAppShell.classList.remove("show-sidebar");
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

  await loadMessages();
  connectSocket();
}

initDashboard();
