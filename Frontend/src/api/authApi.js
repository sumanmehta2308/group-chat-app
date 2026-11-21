const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: "include",
    ...options,
  };

  let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.message || "Request failed");
    err.data = data;
    throw err;
  }
  return data;
}

export function initiateSignup(userData) {
  return apiRequest("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(userData),
  });
}

export function verifyUserOtp(otpData) {
  return apiRequest("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(otpData),
  });
}

export function resendUserOtp(email) {
  return apiRequest("/api/auth/resend-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function setUserPassword(passwordData) {
  return apiRequest("/api/auth/set-password", {
    method: "POST",
    body: JSON.stringify(passwordData),
  });
}

export function loginUser(credentials) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function getCurrentUser() {
  return apiRequest("/api/auth/me", { method: "GET" });
}

export function logoutUser() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  return apiRequest("/api/auth/logout", { method: "POST" });
}

export function requestForgotPassword(email) {
  return apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
