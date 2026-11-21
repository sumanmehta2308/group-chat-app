import "../utils/setup.js";
import { verifyUserOtp, initiateSignup } from "../api/authApi.js";

const displayEmail = document.getElementById("displayEmail");
const otpInputs = document.querySelectorAll(".otp-box");
const otpForm = document.getElementById("otp-form");
const alertBox = document.getElementById("alert-box");
const verifyBtn = document.getElementById("verifyBtn");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");
const resendBtn = document.getElementById("resendBtn");

const signupEmail = sessionStorage.getItem("signupEmail");
const signupFullName = sessionStorage.getItem("signupFullName");

if (!signupEmail) {
  window.location.replace("signup.html");
}

displayEmail.textContent = signupEmail;

function showAlert(msg, type = "danger") {
  alertBox.textContent = msg;
  alertBox.className = `alert alert-${type} text-start small`;
}

function setLoading(loading) {
  verifyBtn.disabled = loading;
  btnText.textContent = loading ? "Verifying..." : "Verify & Continue";
  btnSpinner.classList.toggle("d-none", !loading);
}

otpInputs.forEach((input, index) => {
  input.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
    if (e.target.value && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !e.target.value && index > 0) {
      otpInputs[index - 1].focus();
    }
  });

  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/[^0-9]/g, "")
      .slice(0, 6);
    pasted.split("").forEach((char, i) => {
      if (otpInputs[i]) otpInputs[i].value = char;
    });
    otpInputs[Math.min(pasted.length, otpInputs.length - 1)].focus();
  });
});

let countdown = 60;
let intervalId = null;

function startTimer() {
  countdown = 60;
  resendBtn.disabled = true;
  resendBtn.innerHTML = `Resend in <span id="timer">${countdown}</span>s`;

  clearInterval(intervalId);
  intervalId = setInterval(() => {
    countdown--;
    const timerEl = document.getElementById("timer");
    if (timerEl) timerEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(intervalId);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend OTP";
    }
  }, 1000);
}

startTimer();

resendBtn.addEventListener("click", async () => {
  alertBox.classList.add("d-none");
  try {
    resendBtn.disabled = true;
    resendBtn.textContent = "Sending...";
    const res = await initiateSignup({
      full_name: signupFullName,
      email: signupEmail,
    });
    if (res.success) {
      showAlert("New OTP sent to your email!", "info");
      startTimer();
    }
  } catch (err) {
    showAlert(err.message);
    resendBtn.disabled = false;
    resendBtn.textContent = "Resend OTP";
  }
});

otpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.classList.add("d-none");

  const otpValue = Array.from(otpInputs)
    .map((i) => i.value)
    .join("");
  if (otpValue.length !== 6) {
    showAlert("Please enter all 6 digits.");
    return;
  }

  try {
    setLoading(true);
    const res = await verifyUserOtp({ email: signupEmail, otp: otpValue });

   if (res.success) {
     sessionStorage.setItem("otpVerified", "true");
     window.location.href = "/src/pages/set-password.html";
   }
  } catch (err) {
    showAlert(err.message);
    otpInputs.forEach((inp) => (inp.value = ""));
    otpInputs[0].focus();
  } finally {
    setLoading(false);
  }
});
