import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { A2AAlgorandAdapter } from './adapter.js';
import type { A2AAlgorandConfig, AgentCard } from './types.js';

const mockParams = {
  'last-round': 1000,
  'genesis-id': 'testnet-v1.0',
  'genesis-hash': 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
  fee: 1000,
  'min-fee': 1000,
};

function makeConfig(overrides?: Partial<A2AAlgorandConfig>): A2AAlgorandConfig {
  return {
    algodUrl: 'http://localhost:4001',
    algodToken: 'test-token',
    indexerUrl: 'http://localhost:8980',
    indexerToken: 'test-token',
    agentAddress: 'AGENT_ADDR',
    signer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    ...overrides,
  };
}

function mockFetchResponses(...responses: Array<{ ok: boolean; json: () => unknown; status?: number }>) {
  const fetchMock = vi.fn();
  for (const res of responses) {
    fetchMock.mockResolvedValueOnce(res);
  }
  return fetchMock;
}

describe('A2AAlgorandAdapter', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('send', () => {
    it('fetches params, builds txn, signs, and submits', async () => {
      const fetchMock = mockFetchResponses(
        { ok: true, json: () => mockParams },
        { ok: true, json: () => ({ txId: 'TX_123' }) },
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const config = makeConfig();
      const adapter = new A2AAlgorandAdapter(config);
      const result = await adapter.send('RECIPIENT', 'task.create', {
        taskId: 't1',
        content: 'hello',
      });

      expect(result.txId).toBe('TX_123');
      expect(result.message.from).toBe('AGENT_ADDR');
      expect(result.message.to).toBe('RECIPIENT');
      expect(result.message.type).toBe('task.create');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(config.signer).toHaveBeenCalledOnce();
    });

    it('throws on algod params failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch;

      const adapter = new A2AAlgorandAdapter(makeConfig());
      await expect(adapter.send('RECV', 'task.create', {})).rejects.toThrow('algod params: 500');
    });

    it('throws on submit failure', async () => {
      globalThis.fetch = mockFetchResponses(
        { ok: true, json: () => mockParams },
        { ok: false, json: () => ({}), status: 400 },
      ) as unknown as typeof fetch;

      const adapter = new A2AAlgorandAdapter(makeConfig());
      await expect(adapter.send('RECV', 'task.create', {})).rejects.toThrow('submit txn: 400');
    });
  });

  describe('createTask', () => {
    it('sends a task.create message with skillId', async () => {
      globalThis.fetch = mockFetchResponses(
        { ok: true, json: () => mockParams },
        { ok: true, json: () => ({ txId: 'TX_TASK' }) },
      ) as unknown as typeof fetch;

      const adapter = new A2AAlgorandAdapter(makeConfig());
      const result = await adapter.createTask('RECV', 'summarize', 'do this');

      expect(result.message.type).toBe('task.create');
      expect(result.message.payload.skillId).toBe('summarize');
      expect(result.message.payload.content).toBe('do this');
    });
  });

  describe('completeTask', () => {
    it('sends a task.complete message', async () => {
      globalThis.fetch = mockFetchResponses(
        { ok: true, json: () => mockParams },
        { ok: true, json: () => ({ txId: 'TX_DONE' }) },
      ) as unknown as typeof fetch;

      const adapter = new A2AAlgorandAdapter(makeConfig());
      const result = await adapter.completeTask('RECV', 'task-1', 'result here');

      expect(result.message.type).toBe('task.complete');
      expect(result.message.payload.taskId).toBe('task-1');
    });
  });

  describe('announceCard', () => {
    it('sends agent card to self', async () => {
      globalThis.fetch = mockFetchResponses(
        { ok: true, json: () => mockParams },
        { ok: true, json: () => ({ txId: 'TX_CARD' }) },
      ) as unknown as typeof fetch;

      const adapter = new A2AAlgorandAdapter(makeConfig());
      const card: AgentCard = {
        name: 'TestAgent',
        address: 'AGENT_ADDR',
        skills: [{ id: 's1', name: 'skill', description: 'test' }],
        version: '1.0',
      };
      const result = await adapter.announceCard(card);

      expect(result.message.to).toBe('AGENT_ADDR');
      expect(result.message.type).toBe('agent.card');
      expect(result.message.payload.agentCard).toEqual(card);
    });
  });

  describe('onMessage', () => {
    it('registers and unregisters handlers', () => {
      const adapter = new A2AAlgorandAdapter(makeConfig());
      const handler = vi.fn();
      const unsubscribe = adapter.onMessage(handler);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      // Calling unsubscribe again should not throw
      unsubscribe();
    });
  });

  describe('polling', () => {
    const tick = () => new Promise((r) => setTimeout(r, 20));

    it('starts and stops polling', async () => {
      const adapter = new A2AAlgorandAdapter(makeConfig({ pollIntervalMs: 60000 }));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => ({ transactions: [] }),
      }) as unknown as typeof fetch;

      adapter.startPolling();
      // Starting again should be a no-op
      adapter.startPolling();
      await tick();

      adapter.stopPolling();
      // Stopping again should be safe
      adapter.stopPolling();
    });

    it('dispatches decoded messages to handlers', async () => {
      const handler = vi.fn();
      const config = makeConfig({ pollIntervalMs: 60000 });
      const adapter = new A2AAlgorandAdapter(config);
      adapter.onMessage(handler);

      const { encodeMessage } = await import('./codec.js');
      const message = {
        id: 'msg-1',
        from: 'SENDER',
        to: 'AGENT_ADDR',
        type: 'task.create' as const,
        payload: { content: 'test' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const noteBytes = encodeMessage(message);
      const noteB64 = btoa(String.fromCharCode(...noteBytes));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => ({
          transactions: [
            { id: 'txn-1', note: noteB64, 'confirmed-round': 100, sender: 'SENDER' },
          ],
        }),
      }) as unknown as typeof fetch;

      adapter.startPolling();
      await tick();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-1', from: 'SENDER' }),
      );

      adapter.stopPolling();
    });

    it('skips messages not addressed to this agent', async () => {
      const handler = vi.fn();
      const adapter = new A2AAlgorandAdapter(makeConfig({ pollIntervalMs: 60000 }));
      adapter.onMessage(handler);

      const { encodeMessage } = await import('./codec.js');
      const msg = {
        id: 'msg-2',
        from: 'A',
        to: 'OTHER_AGENT',
        type: 'task.create' as const,
        payload: {},
        timestamp: '2026-01-01T00:00:00Z',
      };
      const noteB64 = btoa(String.fromCharCode(...encodeMessage(msg)));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => ({
          transactions: [{ id: 'txn-2', note: noteB64, 'confirmed-round': 50, sender: 'A' }],
        }),
      }) as unknown as typeof fetch;

      adapter.startPolling();
      await tick();

      expect(handler).not.toHaveBeenCalled();
      adapter.stopPolling();
    });

    it('handles poll errors gracefully', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = new A2AAlgorandAdapter(makeConfig({ pollIntervalMs: 60000 }));

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;

      adapter.startPolling();
      await tick();

      expect(spy).toHaveBeenCalledWith('[a2a-algorand] poll error:', expect.any(Error));
      adapter.stopPolling();
    });
  });
});
