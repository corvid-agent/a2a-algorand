/**
 * Algorand transport adapter for the A2A protocol.
 *
 * Sends A2A messages as Algorand payment transactions (0 Algo, with note field).
 * Reads messages by polling the indexer for transactions to/from the agent address.
 */

import type {
  A2AAlgorandConfig,
  A2AMessage,
  A2AMessageType,
  A2APayload,
  AgentCard,
  MessageHandler,
  SendResult,
} from './types.js';
import { encodeMessage, decodeMessage } from './codec.js';

export class A2AAlgorandAdapter {
  private config: A2AAlgorandConfig;
  private handlers: MessageHandler[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastRound = 0;

  constructor(config: A2AAlgorandConfig) {
    this.config = config;
  }

  /** Register a handler for incoming A2A messages */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  /** Send an A2A message to another agent */
  async send(
    to: string,
    type: A2AMessageType,
    payload: A2APayload,
    inReplyTo?: string,
  ): Promise<SendResult> {
    const message: A2AMessage = {
      id: crypto.randomUUID(),
      from: this.config.agentAddress,
      to,
      type,
      payload,
      timestamp: new Date().toISOString(),
      inReplyTo,
    };

    const note = encodeMessage(message);

    // Build a 0-Algo payment transaction with the A2A message in the note field
    const params = await this.getSuggestedParams();
    const txn = this.buildPaymentTxn(to, 0, note, params);
    const signed = await this.config.signer(txn);
    const txId = await this.submitTransaction(signed);

    return { txId, message };
  }

  /** Create a task on a remote agent */
  async createTask(
    to: string,
    skillId: string,
    content: string,
    data?: Record<string, unknown>,
  ): Promise<SendResult> {
    return this.send(to, 'task.create', {
      taskId: crypto.randomUUID(),
      skillId,
      content,
      data,
    });
  }

  /** Respond to a task with a result */
  async completeTask(
    to: string,
    taskId: string,
    content: string,
    data?: Record<string, unknown>,
  ): Promise<SendResult> {
    return this.send(to, 'task.complete', { taskId, content, data });
  }

  /** Broadcast this agent's card for discovery */
  async announceCard(card: AgentCard): Promise<SendResult> {
    // Send to self as a broadcast (discoverable via indexer)
    return this.send(this.config.agentAddress, 'agent.card', {
      agentCard: card,
    });
  }

  /** Start polling for incoming messages */
  startPolling(): void {
    if (this.pollTimer) return;
    const interval = this.config.pollIntervalMs ?? 4000;
    this.pollTimer = setInterval(() => this.poll(), interval);
    // Poll immediately on start
    this.poll();
  }

  /** Stop polling for messages */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Poll the indexer for new A2A messages */
  private async poll(): Promise<void> {
    try {
      const transactions = await this.searchTransactions();
      for (const txn of transactions) {
        if (!txn.note) continue;
        const note = base64ToUint8Array(txn.note);
        const message = decodeMessage(note);
        if (message && message.to === this.config.agentAddress) {
          for (const handler of this.handlers) {
            await handler(message);
          }
        }
        if (txn['confirmed-round'] > this.lastRound) {
          this.lastRound = txn['confirmed-round'];
        }
      }
    } catch (err) {
      console.error('[a2a-algorand] poll error:', err);
    }
  }

  // --- Algorand client helpers (thin wrappers around fetch) ---

  private async getSuggestedParams(): Promise<SuggestedParams> {
    const res = await fetch(
      `${this.config.algodUrl}/v2/transactions/params`,
      { headers: { 'X-Algo-API-Token': this.config.algodToken } },
    );
    if (!res.ok) throw new Error(`algod params: ${res.status}`);
    return res.json();
  }

  private buildPaymentTxn(
    to: string,
    amount: number,
    note: Uint8Array,
    params: SuggestedParams,
  ): Uint8Array {
    // This is a placeholder — real implementation would use algosdk
    // to build and encode a proper payment transaction.
    // For now, return a JSON representation for the signer to handle.
    const txnData = {
      type: 'pay',
      from: this.config.agentAddress,
      to,
      amount,
      note: uint8ArrayToBase64(note),
      firstRound: params['last-round'],
      lastRound: params['last-round'] + 1000,
      genesisID: params['genesis-id'],
      genesisHash: params['genesis-hash'],
    };
    return new TextEncoder().encode(JSON.stringify(txnData));
  }

  private async submitTransaction(signed: Uint8Array): Promise<string> {
    const res = await fetch(`${this.config.algodUrl}/v2/transactions`, {
      method: 'POST',
      headers: {
        'X-Algo-API-Token': this.config.algodToken,
        'Content-Type': 'application/x-binary',
      },
      body: signed,
    });
    if (!res.ok) throw new Error(`submit txn: ${res.status}`);
    const data = await res.json();
    return data.txId;
  }

  private async searchTransactions(): Promise<IndexerTransaction[]> {
    const url = new URL(
      `${this.config.indexerUrl}/v2/transactions`,
    );
    url.searchParams.set('address', this.config.agentAddress);
    url.searchParams.set('note-prefix', uint8ArrayToBase64(new TextEncoder().encode('a2a/v1')));
    if (this.lastRound > 0) {
      url.searchParams.set('min-round', String(this.lastRound + 1));
    }
    url.searchParams.set('limit', '50');

    const res = await fetch(url.toString(), {
      headers: { 'X-Algo-API-Token': this.config.indexerToken },
    });
    if (!res.ok) throw new Error(`indexer search: ${res.status}`);
    const data = await res.json();
    return data.transactions ?? [];
  }
}

// --- Utility types ---

interface SuggestedParams {
  'last-round': number;
  'genesis-id': string;
  'genesis-hash': string;
  fee: number;
  'min-fee': number;
}

interface IndexerTransaction {
  id: string;
  note?: string;
  'confirmed-round': number;
  sender: string;
  'payment-transaction'?: { receiver: string; amount: number };
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
