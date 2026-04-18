/**
 * Utilities for parsing and rendering @mentions in comments.
 *
 * A mention is defined as `@` followed by a username matching [a-zA-Z0-9_.]+.
 * Usernames are case-insensitive on lookup but preserved in the original casing
 * when displayed.
 */

// Matches @username at word boundary. Capturing group 1 = the username (without @).
// - Starts at string start, newline, whitespace, or non-word char
// - Followed by @ and 2+ allowed chars (to avoid matching stray @ characters)
export const MENTION_REGEX = /(^|[\s(\[{,])@([a-zA-Z0-9_.]{2,30})/g;

// Non-global version for single-match extraction (needed in some contexts).
export const MENTION_REGEX_SINGLE = /(^|[\s(\[{,])@([a-zA-Z0-9_.]{2,30})/;

/**
 * Extract all unique @usernames mentioned in a comment.
 * Returns usernames in lowercase (matching how Firestore stores them).
 */
export function extractMentions(text: string): string[] {
  const mentions = new Set<string>();
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    mentions.add(match[2].toLowerCase());
  }
  return Array.from(mentions);
}

/**
 * Detect whether the user is currently typing a mention at the cursor position.
 * Returns the active query (without @) if so — useful for the autocomplete popup.
 *
 * Examples:
 *   "Hey @lu" → { query: "lu", start: 4 }
 *   "Hey @" → { query: "", start: 4 }  (empty query = show suggestions)
 *   "Hey @lucien !" → null (space after breaks the "actively typing" state)
 *   "Hey lucien" → null (no @)
 */
export function detectActiveMention(
  text: string,
  cursorPos: number,
): { query: string; start: number } | null {
  // Look backwards from cursor for the nearest @ that starts a mention.
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;

  // Check: the @ must be at the start or preceded by whitespace / boundary char.
  if (atIdx > 0) {
    const prevChar = before[atIdx - 1];
    if (!/[\s(\[{,]/.test(prevChar)) return null;
  }

  // Check: between @ and cursor, only allowed chars (no whitespace, no @)
  const query = before.slice(atIdx + 1);
  if (!/^[a-zA-Z0-9_.]*$/.test(query)) return null;

  return { query, start: atIdx };
}

/**
 * Replace the currently-typed partial mention with a full @username.
 * Returns the new text and the new cursor position.
 */
export function insertMention(
  text: string,
  cursorPos: number,
  username: string,
): { newText: string; newCursor: number } {
  const active = detectActiveMention(text, cursorPos);
  if (!active) {
    // No active mention — just append.
    const newText = text.slice(0, cursorPos) + `@${username} ` + text.slice(cursorPos);
    return { newText, newCursor: cursorPos + username.length + 2 };
  }
  const before = text.slice(0, active.start);
  const after = text.slice(cursorPos);
  const insertion = `@${username} `;
  return {
    newText: before + insertion + after,
    newCursor: active.start + insertion.length,
  };
}

/**
 * Split a comment text into an array of segments (text + mentions) for rendering.
 * Use this to render a Text with clickable/styled mentions.
 *
 * Example:
 *   "Hey @lucien check this out @jeanne!" →
 *   [
 *     { type: 'text', value: 'Hey ' },
 *     { type: 'mention', value: 'lucien', raw: '@lucien' },
 *     { type: 'text', value: ' check this out ' },
 *     { type: 'mention', value: 'jeanne', raw: '@jeanne' },
 *     { type: 'text', value: '!' },
 *   ]
 */
export type CommentSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; raw: string };

export function tokenizeComment(text: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, prefix, username] = match;
    const matchStart = match.index + prefix.length;
    // Text before the mention (including the prefix char like space)
    if (matchStart > lastIdx) {
      segments.push({ type: 'text', value: text.slice(lastIdx, matchStart) });
    }
    segments.push({ type: 'mention', value: username, raw: `@${username}` });
    lastIdx = matchStart + username.length + 1; // +1 for the @
  }

  if (lastIdx < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIdx) });
  }

  return segments;
}
