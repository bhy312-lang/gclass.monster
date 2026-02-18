// Message ID Generator for FCM System
// Format: msg_<YYYYMMDD>_<base36(random)><base36(timestamp)>
// Example: msg_20260218_abc123xyz456

/**
 * Generate a globally unique message ID
 * @returns Unique message ID string
 */
export function generateMessageId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
  const timestamp = Date.now().toString(36);
  return `msg_${date}_${random}${timestamp}`;
}

/**
 * Validate message ID format
 * @param id Message ID to validate
 * @returns true if valid format
 */
export function isValidMessageId(id: string): boolean {
  return /^msg_\d{8}[a-z0-9]{12,}$/i.test(id);
}

/**
 * Extract date from message ID
 * @param id Message ID
 * @returns Date string (YYYY-MM-DD) or null if invalid
 */
export function extractDateFromMessageId(id: string): string | null {
  const match = id.match(/^msg_(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
