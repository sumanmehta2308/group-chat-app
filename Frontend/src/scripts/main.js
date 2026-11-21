import "../utils/setup.js";
import { getCurrentUser } from "../api/authApi.js";

async function checkAuthAndRedirect() {
  try {
    const res = await getCurrentUser();
    if (res.success) {
      window.location.replace("/src/pages/dashboard.html");
    } else {
      window.location.replace("/src/pages/login.html");
    }
  } catch {
    window.location.replace("/src/pages/login.html");
  }
}

checkAuthAndRedirect();
