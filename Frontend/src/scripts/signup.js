import "../utils/setup.js";
import { validateFullName, validateEmail } from "../utils/validators.js";
import { initiateSignup } from "../api/authApi.js";

const signupForm = document.getElementById("signup-form");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const alertBox = document.getElementById("alert-box");
const submitBtn = document.getElementById("submitBtn");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");

function setFieldValidity(el, isValid) {
  el.classList.toggle("is-valid", isValid);
  el.classList.toggle("is-invalid", !isValid);
}

function showAlert(msg, type = "danger") {
  alertBox.textContent = msg;
  alertBox.className = `alert alert-${type} small`;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.textContent = loading ? "Sending OTP..." : "Send Verification OTP";
  btnSpinner.classList.toggle("d-none", !loading);
}

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.classList.add("d-none");

  const fullName = fullNameInput.value;
  const email = emailInput.value;

  const isNameValid = validateFullName(fullName);
  const isEmailValid = validateEmail(email);

  setFieldValidity(fullNameInput, isNameValid);
  setFieldValidity(emailInput, isEmailValid);

  if (!isNameValid || !isEmailValid) return;

  try {
    setLoading(true);
    const res = await initiateSignup({
      full_name: fullName.trim(),
      email: email.trim(),
    });

   if (res.success) {
     sessionStorage.setItem("signupFullName", fullName.trim());
     sessionStorage.setItem(
       "signupEmail",
       res.email || email.trim().toLowerCase()
     );
     window.location.href = "/src/pages/verify.html";
   }
  } catch (err) {
    showAlert(err.message);
  } finally {
    setLoading(false);
  }
});
