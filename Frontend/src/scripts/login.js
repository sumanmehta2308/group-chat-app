import "../utils/setup.js";
import { validateEmail } from "../utils/validators.js";
import { loginUser, requestForgotPassword } from "../api/authApi.js";

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePassword");
const toggleIcon = document.getElementById("toggleIcon");
const alertBox = document.getElementById("alert-box");
const loginBtn = document.getElementById("loginBtn");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");
const showForgotBtn = document.getElementById("showForgotBtn");
const forgotTriggerWrapper = document.getElementById("forgotTriggerWrapper");
const forgotForm = document.getElementById("forgot-form");
const forgotEmailInput = document.getElementById("forgotEmail");
const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");

togglePasswordBtn.addEventListener("click", () => {
  const isPass = passwordInput.type === "password";
  passwordInput.type = isPass ? "text" : "password";
  toggleIcon.className = isPass ? "bi bi-eye-slash" : "bi bi-eye";
});

function showAlert(msg, type = "danger") {
  alertBox.textContent = msg;
  alertBox.className = `alert alert-${type} small py-2 px-3 mb-3`;
}

function setLoading(loading) {
  loginBtn.disabled = loading;
  btnText.textContent = loading ? "Signing In..." : "Sign in";
  btnSpinner.classList.toggle("d-none", !loading);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.classList.add("d-none");

  const email = emailInput.value;
  const password = passwordInput.value;

  const isEmailValid = validateEmail(email);
  const isPassValid = password.trim().length > 0;

  emailInput.classList.toggle("is-invalid", !isEmailValid);
  passwordInput.classList.toggle("is-invalid", !isPassValid);

  if (!isEmailValid || !isPassValid) return;

  try {
    setLoading(true);
    const res = await loginUser({ email: email.trim(), password });

    if (res.success) {
      if (res.token) localStorage.setItem("token", res.token);
      if (res.user) localStorage.setItem("user", JSON.stringify(res.user));

      sessionStorage.removeItem("signupEmail");
      sessionStorage.removeItem("signupFullName");
      sessionStorage.removeItem("otpVerified");

      window.location.href = "/src/pages/dashboard.html";
    }
  } catch (err) {
    if (err.data?.requiresVerification) {
      sessionStorage.setItem("signupEmail", err.data.email || email.trim());
      showAlert(err.message, "warning");
      setTimeout(() => {
        window.location.href = "/src/pages/verify.html";
      }, 1200);
      return;
    }
    showAlert(err.message);
  } finally {
    setLoading(false);
  }
});

if (showForgotBtn && forgotForm) {
  showForgotBtn.addEventListener("click", () => {
    loginForm.classList.add("d-none");
    forgotTriggerWrapper.classList.add("d-none");
    forgotForm.classList.remove("d-none");
    alertBox.classList.add("d-none");
    forgotEmailInput.focus();
  });
}

if (backToLoginBtn && forgotForm) {
  backToLoginBtn.addEventListener("click", () => {
    forgotForm.classList.add("d-none");
    loginForm.classList.remove("d-none");
    forgotTriggerWrapper.classList.remove("d-none");
    alertBox.classList.add("d-none");
  });
}

if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = forgotEmailInput.value.trim();
    if (!validateEmail(email)) {
      showAlert("Please enter a valid registered email address.", "danger");
      return;
    }
    try {
      forgotSubmitBtn.disabled = true;
      forgotSubmitBtn.textContent = "Sending link...";
      const res = await requestForgotPassword(email);
      if (res.success) {
        showAlert(
          res.message || "Reset link sent! Check your email inbox.",
          "success"
        );
        forgotForm.reset();
      }
    } catch (err) {
      showAlert(err.message || "Failed to send reset link.", "danger");
    } finally {
      forgotSubmitBtn.disabled = false;
      forgotSubmitBtn.textContent = "Send Reset Link";
    }
  });
}
