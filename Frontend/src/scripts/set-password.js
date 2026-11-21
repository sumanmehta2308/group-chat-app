import "../utils/setup.js";
import { validatePassword, doPasswordsMatch } from "../utils/validators.js";
import { setUserPassword } from "../api/authApi.js";

const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const verifiedEmailText = document.getElementById("verifiedEmailText");
const passwordForm = document.getElementById("password-form");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const togglePasswordBtn = document.getElementById("togglePassword");
const toggleIcon = document.getElementById("toggleIcon");
const alertBox = document.getElementById("alert-box");
const saveBtn = document.getElementById("saveBtn");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");

const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get("token");

const signupEmail = sessionStorage.getItem("signupEmail");
const isOtpVerified = sessionStorage.getItem("otpVerified");
if (!resetToken && (!signupEmail || isOtpVerified !== "true")) {
  window.location.replace("signup.html");
}

if (resetToken) {
  pageTitle.textContent = "Reset your password";
  pageSubtitle.textContent = "Enter a new strong password for your account";
  btnText.textContent = "Reset Password";
} else {
  verifiedEmailText.textContent = signupEmail;
}

togglePasswordBtn.addEventListener("click", () => {
  const isPass = passwordInput.type === "password";
  passwordInput.type = isPass ? "text" : "password";
  toggleIcon.className = isPass ? "bi bi-eye-slash" : "bi bi-eye";
});

function setFieldValidity(el, isValid) {
  el.classList.toggle("is-valid", isValid);
  el.classList.toggle("is-invalid", !isValid);
}

function showAlert(msg, type = "danger") {
  alertBox.textContent = msg;
  alertBox.className = `alert alert-${type} small py-2 px-3 mb-3`;
}

function setLoading(loading) {
  saveBtn.disabled = loading;
  if (resetToken) {
    btnText.textContent = loading ? "Updating Password..." : "Reset Password";
  } else {
    btnText.textContent = loading
      ? "Saving Password..."
      : "Complete Registration";
  }
  btnSpinner.classList.toggle("d-none", !loading);
}

passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.classList.add("d-none");

  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  const isPassValid = validatePassword(password);
  const isConfirmValid = doPasswordsMatch(password, confirmPassword);

  setFieldValidity(passwordInput, isPassValid);
  setFieldValidity(confirmPasswordInput, isConfirmValid);

  if (!isPassValid || !isConfirmValid) return;

  try {
    setLoading(true);
    const payload = resetToken
      ? { token: resetToken, password }
      : { email: signupEmail, password };

    const res = await setUserPassword(payload);

    if (res.success) {
      sessionStorage.removeItem("signupEmail");
      sessionStorage.removeItem("signupFullName");
      sessionStorage.removeItem("otpVerified");
      showAlert(
        res.message || "Password saved! Redirecting to login...",
        "success"
      );
      setTimeout(() => {
        window.location.href = "/src/pages/login.html";
      }, 1200);
    }
  } catch (err) {
    showAlert(err.message);
  } finally {
    setLoading(false);
  }
});
