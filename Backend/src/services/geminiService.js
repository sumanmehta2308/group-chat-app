import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.0-flash";

// 5-minute TTL cache so repeated phrases complete in <5ms without extra API calls
const responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  if (responseCache.size > 300) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function safeParseJsonArray(rawText) {
  try {
    const cleaned = String(rawText || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const startIdx = cleaned.indexOf("[");
    const endIdx = cleaned.lastIndexOf("]");
    const jsonSlice =
      startIdx !== -1 && endIdx !== -1 && endIdx > startIdx
        ? cleaned.slice(startIdx, endIdx + 1)
        : cleaned;

    const parsed = JSON.parse(jsonSlice);
    if (!Array.isArray(parsed)) return [];

    return [
      ...new Set(
        parsed
          .map((item) => String(item).replace(/\s+/g, " ").trim())
          .filter((item) => item.length > 0 && item.length <= 80)
      ),
    ].slice(0, 3);
  } catch {
    return [];
  }
}

function formatConversationHistory(recentContext = []) {
  if (!Array.isArray(recentContext) || recentContext.length === 0) {
    return "No previous messages.";
  }

  return recentContext
    .slice(-5)
    .map((m) => `${m.sender || "User"}: ${String(m.text || "").trim()}`)
    .join("\n");
}

function getFallbackPredictions(partialText, userStyle = "") {
  const text = partialText.trim().toLowerCase();
  const isHinglish = userStyle.toLowerCase().includes("hinglish");

  if (text.includes("meet")) {
    return isHinglish
      ? [
          "5 baje sham ko canteen mein",
          "main gate par thodi der mein",
          "kal subah class ke baad",
        ]
      : [
          "the main gate around 5 pm",
          "tomorrow morning after the lecture",
          "at the coffee shop this evening",
        ];
  }
  if (
    text.includes("lunch") ||
    text.includes("dinner") ||
    text.includes("eat")
  ) {
    return isHinglish
      ? [
          "saath mein chalte hain 10 min mein?",
          "canteen mein milte hain abhi?",
          "baad mein karein thoda kaam hai",
        ]
      : [
          "together at the cafeteria in 15 mins?",
          "around 1:30 pm if you are free?",
          "at our usual spot today?",
        ];
  }
  if (text.includes("send") || text.includes("file") || text.includes("code")) {
    return isHinglish
      ? [
          "updated file abhi group mein bhejta hoon",
          "GitHub par push karke link deta hoon",
          "thodi der mein check karke bhejunga",
        ]
      : [
          "the updated project files right away",
          "you the GitHub repository link shortly",
          "it over as soon as I finish",
        ];
  }

  return isHinglish
    ? [
        "abhi thodi der mein baat karte hain 👍",
        "sham ko free hokar call karta hoon",
        "kal milte hain aur discuss karte hain",
      ]
    : [
        "in a few minutes once I am free 👍",
        "later this evening to discuss the details",
        "tomorrow morning if that works for you",
      ];
}

function getFallbackSmartReplies(latestText = "", userStyle = "") {
  const msg = latestText.toLowerCase();
  const isHinglish = userStyle.toLowerCase().includes("hinglish");

  if (msg.includes("?")) {
    return isHinglish
      ? [
          "Haan bilkul! 👍",
          "Abhi check karke batata hoon",
          "Thodi der mein baat karein?",
        ]
      : [
          "Yes, sounds great! 👍",
          "Let me check and get back",
          "Can we discuss in 10 mins?",
        ];
  }
  if (msg.includes("meet") || msg.includes("lunch") || msg.includes("call")) {
    return isHinglish
      ? [
          "Haan, chalo milte hain!",
          "5 min mein free hota hoon",
          "Time batao kab milna hai?",
        ]
      : ["Yes, I'll be there!", "Give me 10 mins", "What time works best?"];
  }
  return isHinglish
    ? ["Okay done 👍", "Sahi hai, samajh gaya", "Thanks bhai! 🙌"]
    : ["Got it, thanks! 👍", "Sounds good to me", "Sure, let's do that!"];
}

async function callGeminiWithFallback(prompt, temperature, maxOutputTokens) {
  if (!ai) return null;

  for (const modelName of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { temperature, maxOutputTokens },
      });
      const parsed = safeParseJsonArray(response.text);
      if (parsed.length > 0) return parsed;
    } catch (err) {
      console.warn(`[Gemini ${modelName} skipped]:`, err.status || err.message);
    }
  }
  return null;
}

export async function generatePredictiveCompletions({
  partialText,
  recentContext = [],
  userStyle = "casual, friendly, concise with emojis",
}) {
  const trimmedInput = String(partialText || "").trim();
  if (trimmedInput.length < 2) return [];

  const lastMessage =
    Array.isArray(recentContext) && recentContext.length > 0
      ? recentContext[recentContext.length - 1].text
      : "";
  const cacheKey = `predict:${userStyle}:${trimmedInput.toLowerCase()}:${lastMessage}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const historyBlock = formatConversationHistory(recentContext);
  const prompt = `Complete this chat message naturally with 3 distinct full-phrase continuations (4 to 7 words each).
Tone: ${userStyle}
Recent chat:
${historyBlock}
Draft: "${partialText}"
Rules: Do NOT repeat words already in Draft. Make each option complete the whole thought smoothly. Match language (English/Hinglish). Return ONLY a valid JSON array of 3 strings.`;

  const aiResult = await callGeminiWithFallback(prompt, 0.35, 120);
  const finalSuggestions =
    aiResult && aiResult.length > 0
      ? aiResult
      : getFallbackPredictions(trimmedInput, userStyle);

  setCached(cacheKey, finalSuggestions);
  return finalSuggestions;
}

export async function generateSmartReplies({
  recentContext = [],
  userStyle = "casual, friendly, concise with emojis",
}) {
  if (!Array.isArray(recentContext) || recentContext.length === 0) return [];

  const latestMessage = recentContext[recentContext.length - 1];
  if (!latestMessage || latestMessage.sender === "Me") return [];

  const cacheKey = `reply:${userStyle}:${latestMessage.sender}:${latestMessage.text}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const historyBlock = formatConversationHistory(recentContext);
  const prompt = `Suggest 3 short chat replies (3 to 7 words each) to the latest message.
Tone: ${userStyle}
Recent chat:
${historyBlock}
Latest message from ${latestMessage.sender}: "${latestMessage.text}"
Rules: Diverse intents (affirmative / follow-up question / status update). Match language (English/Hinglish). Return ONLY a valid JSON array of 3 strings.`;

  const aiResult = await callGeminiWithFallback(prompt, 0.45, 120);
  const finalReplies =
    aiResult && aiResult.length > 0
      ? aiResult
      : getFallbackSmartReplies(latestMessage.text, userStyle);

  setCached(cacheKey, finalReplies);
  return finalReplies;
}
