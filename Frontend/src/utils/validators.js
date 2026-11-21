export function validateFullName(name) {
  return typeof name === "string" && name.trim().length >= 3;
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 6;
}

export function doPasswordsMatch(password, confirmPassword) {
  return password === confirmPassword && confirmPassword.length > 0;
}
