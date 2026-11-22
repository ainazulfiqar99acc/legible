// Event-name-only log. Never pass metric values, landmarks or the API key here.

const KEYLIKE = /[A-Za-z0-9_-]{24,}/g;

export function log(event: string): void {
  // belt and braces: redact anything shaped like a long token
  console.log(`[legible] ${new Date().toISOString()} ${event.replace(KEYLIKE, '[redacted]')}`);
}
