import { describe, it, expect } from 'vitest';
import { encodeMessage, decodeMessage, isA2ANote } from './codec.js';
import type { A2AMessage } from './types.js';

const sampleMessage: A2AMessage = {
  id: 'test-123',
  from: 'SENDER_ADDRESS',
  to: 'RECEIVER_ADDRESS',
  type: 'task.create',
  payload: {
    taskId: 'task-456',
    skillId: 'summarize',
    content: 'Summarize this document',
  },
  timestamp: '2026-02-27T00:00:00.000Z',
};

describe('codec', () => {
  it('round-trips a message through encode/decode', () => {
    const encoded = encodeMessage(sampleMessage);
    const decoded = decodeMessage(encoded);
    expect(decoded).toEqual(sampleMessage);
  });

  it('returns null for non-A2A notes', () => {
    const note = new TextEncoder().encode('random note');
    expect(decodeMessage(note)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const note = new TextEncoder().encode('a2a/v1:{invalid');
    expect(decodeMessage(note)).toBeNull();
  });

  it('detects A2A notes', () => {
    const a2aNote = encodeMessage(sampleMessage);
    const otherNote = new TextEncoder().encode('algochat/v1:hello');

    expect(isA2ANote(a2aNote)).toBe(true);
    expect(isA2ANote(otherNote)).toBe(false);
  });

  it('preserves inReplyTo field', () => {
    const reply: A2AMessage = {
      ...sampleMessage,
      id: 'reply-789',
      type: 'task.complete',
      inReplyTo: 'test-123',
    };
    const encoded = encodeMessage(reply);
    const decoded = decodeMessage(encoded);
    expect(decoded?.inReplyTo).toBe('test-123');
  });
});
