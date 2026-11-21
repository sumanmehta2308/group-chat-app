import "../utils/setup.js";
import { getCurrentUser, logoutUser } from "../api/authApi.js";

const currentUserAvatar = document.getElementById("currentUserAvatar");
const currentUserName = document.getElementById("currentUserName");
const chatListEl = document.getElementById("chatList");
const chatSearchInput = document.getElementById("chatSearchInput");
const activeChatAvatar = document.getElementById("activeChatAvatar");
const activeChatName = document.getElementById("activeChatName");
const activeChatStatus = document.getElementById("activeChatStatus");
const messagesViewport = document.getElementById("messagesViewport");
const messagesContainer = document.getElementById("messagesContainer");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const scrollBottomBtn = document.getElementById("scrollBottomBtn");
const logoutBtn = document.getElementById("logoutBtn");
const mobileBackBtn = document.getElementById("mobileBackBtn");
const chatAppShell = document.querySelector(".chat-app-shell");

let currentUser = { id: 1, name: "Suman Mehta", email: "suman@example.com" };

const rooms = [
  {
    id: "group-1",
    name: "NIT Raipur MCA Squad",
    initials: "NR",
    members: "Suman, Rahul, Priya, Ankit, You",
    messages: [
      {
        id: 1,
        sender: "Rahul Verma",
        text: "Hey everyone! Welcome to the group chat.",
        time: "10:15 AM",
        outgoing: false,
      },
      {
        id: 2,
        sender: "Priya Sharma",
        text: "UI looks super clean just like WhatsApp Web!",
        time: "10:17 AM",
        outgoing: false,
      },
      {
        id: 3,
        sender: "You",
        text: "Thanks! Next we will wire up Socket.io for live messaging.",
        time: "10:18 AM",
        outgoing: true,
      },
    ],
  },
  {
    id: "group-2",
    name: "Placement Prep 2026",
    initials: "PP",
    members: "Suman, Aman, Neha, You",
    messages: [
      {
        id: 1,
        sender: "Aman Gupta",
        text: "Did anyone solve today's LeetCode POTD?",
        time: "09:40 AM",
        outgoing: false,
      },
      {
        id: 2,
        sender: "You",
        text: "Yes, solved it using Dynamic Programming in O(n) space.",
        time: "09:45 AM",
        outgoing: true,
      },
    ],
  },
  {
    id: "dm-1",
    name: "Ankit Kumar",
    initials: "AK",
    members: "Online",
    messages: [
      {
        id: 1,
        sender: "Ankit Kumar",
        text: "Bro, send me the backend repo link once pushed.",
        time: "Yesterday",
        outgoing: false,
      },
    ],
  },
];

let activeRoomId = rooms[0].id;

function formatCurrentTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom(force = true) {
  if (force) {
    messagesViewport.scrollTop = messagesViewport.scrollHeight;
    scrollBottomBtn.classList.add("d-none");
  }
}

function renderSidebar(filterText = "") {
  const query = filterText.trim().toLowerCase();
  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(query)
  );

  chatListEl.innerHTML = filteredRooms
    .map((room) => {
      const lastMsg = room.messages[room.messages.length - 1];
      const preview = lastMsg
        ? `${lastMsg.outgoing ? "You: " : `${lastMsg.sender}: `}${lastMsg.text}`
        : "No messages yet";
      const time = lastMsg ? lastMsg.time : "";
      const isActive = room.id === activeRoomId ? "active" : "";

      return `
        <div class="chat-item ${isActive}" data-room-id="${room.id}">
          <div class="chat-avatar">${escapeHtml(room.initials)}</div>
          <div class="chat-item-meta">
            <div class="chat-item-top">
              <span class="chat-item-name">${escapeHtml(room.name)}</span>
              <span class="chat-item-time">${escapeHtml(time)}</span>
            </div>
            <div class="chat-item-preview">${escapeHtml(preview)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => {
      activeRoomId = item.dataset.roomId;
      chatAppShell.classList.add("mobile-chat-open");
      renderSidebar(chatSearchInput.value);
      renderActiveChat();
    });
  });
}

function renderActiveChat() {
  const room = rooms.find((r) => r.id === activeRoomId);
  if (!room) return;

  activeChatAvatar.textContent = room.initials;
  activeChatName.textContent = room.name;
  activeChatStatus.textContent = room.members;

  messagesContainer.innerHTML = room.messages
    .map((msg) => {
      const rowClass = msg.outgoing ? "outgoing" : "incoming";
      const senderHtml = !msg.outgoing
        ? `<div class="msg-sender">${escapeHtml(msg.sender)}</div>`
        : "";
      const tickHtml = msg.outgoing
        ? `<i class="bi bi-check2-all msg-status-icon"></i>`
        : "";

      return `
        <div class="msg-row ${rowClass}">
          <div class="msg-bubble">
            ${senderHtml}
            <span class="msg-text">${escapeHtml(msg.text)}</span>
            <span class="msg-meta">
              <span>${escapeHtml(msg.time)}</span>
              ${tickHtml}
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  scrollToBottom(true);
}

messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const room = rooms.find((r) => r.id === activeRoomId);
  if (!room) return;

  room.messages.push({
    id: Date.now(),
    sender: "You",
    text,
    time: formatCurrentTime(),
    outgoing: true,
  });

  messageInput.value = "";
  renderActiveChat();
  renderSidebar(chatSearchInput.value);
});

messagesViewport.addEventListener("scroll", () => {
  const distanceFromBottom =
    messagesViewport.scrollHeight -
    messagesViewport.scrollTop -
    messagesViewport.clientHeight;
  scrollBottomBtn.classList.toggle("d-none", distanceFromBottom < 120);
});

scrollBottomBtn.addEventListener("click", () => scrollToBottom(true));

chatSearchInput.addEventListener("input", (e) => {
  renderSidebar(e.target.value);
});

if (mobileBackBtn) {
  mobileBackBtn.addEventListener("click", () => {
    chatAppShell.classList.remove("mobile-chat-open");
  });
}

logoutBtn.addEventListener("click", async () => {
  try {
    await logoutUser();
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
  window.location.replace("/src/pages/login.html");
});

async function initDashboard() {
  const storedUser = localStorage.getItem("user");
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
  } else {
    try {
      const res = await getCurrentUser();
      if (res.success && res.user) {
        currentUser = res.user;
      }
    } catch {
      window.location.replace("/src/pages/login.html");
      return;
    }
  }

  currentUserName.textContent = currentUser.name;
  currentUserAvatar.textContent = currentUser.name.charAt(0).toUpperCase();

  renderSidebar();
  renderActiveChat();
}

initDashboard();
