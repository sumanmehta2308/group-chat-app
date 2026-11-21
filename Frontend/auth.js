document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");

  // Sign Up Form Handler
  if (signupForm) {
    signupForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const userData = {
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        password: document.getElementById("password").value,
      };

      console.log("Sign Up Payload:", userData);
      alert("Sign Up form submitted! (Backend integration pending)");
      signupForm.reset();
    });
  }

  // Login Form Handler
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const loginData = {
        identifier: document.getElementById("identifier").value.trim(), // Email or Phone
        password: document.getElementById("loginPassword").value,
      };

      console.log("Login Payload:", loginData);
      alert("Login form submitted! (Backend integration pending)");
      loginForm.reset();
    });
  }
});
