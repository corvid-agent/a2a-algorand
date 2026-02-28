/**
 * Encode and decode A2A messages for Algorand transaction notes.
 *
 * Format: "a2a/v1" prefix + msgpack-encoded payload.
 * Falls back to JSON encoding for simplicity in v0.1.
 */

import { A2A_NOTE_PREFIX } from './types.js';
import type { A2AMessage } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encode an A2A message into an Algorand transaction note */
export function encodeMessage(message: A2AMessage): Uint8Array {
  const json = JSON.stringify(message);
  const prefixed = `${A2A_NOTE_PREFIX}:${json}`;
  return encoder.encode(prefixed);
}

/** Decode an A2A message from an Algorand transaction note */
export function decodeMessage(note: Uint8Array): A2AMessage | null {
  try {
    const text = decoder.decode(note);
    if (!text.startsWith(`${A2A_NOTE_PREFIX}:`)) {
      return null;
    }
    const json = text.slice(A2A_NOTE_PREFIX.length + 1);
    return JSON.parse(json) as A2AMessage;
  } catch {
    return null;
  }
}

/** Check if a transaction note contains an A2A message */
export function isA2ANote(note: Uint8Array): boolean {
  try {
    const text = decoder.decode(note);
    return text.startsWith(`${A2A_NOTE_PREFIX}:`);
  } catch {
    return false;
  }
}
