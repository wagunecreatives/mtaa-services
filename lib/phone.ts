export function normalizePhoneNumber(value: string) {
  const normalized = value.trim().replace(/[ ()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}
