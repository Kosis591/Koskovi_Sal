const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^(\+?\d{1,3}\s*)?(\d[\s-]*){9}$/;

export function isValidOptionalEmail(email?: string) {
  return !email || emailPattern.test(email.trim());
}

export function isValidPhone(phone?: string) {
  return Boolean(phone && phonePattern.test(phone.trim()));
}
