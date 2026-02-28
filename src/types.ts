/**
 * Core A2A protocol types adapted for Algorand transport.
 *
 * Based on the A2A (Agent-to-Agent) protocol specification.
 * See: https://github.com/google/A2A
 */

/** Unique identifier for an agent on the network */
export interface AgentCard {
  /** Human-readable agent name */
  name: string;
  /** Algorand address of the agent */
  address: string;
  /** Description of agent capabilities */
  description?: string;
  /** Skills this agent provides */
  skills: AgentSkill[];
  /** Protocol version */
  version: string;
}

export interface AgentSkill {
  /** Unique skill identifier */
  id: string;
  /** Human-readable skill name */
  name: string;
  /** Description of what this skill does */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  outputSchema?: Record<string, unknown>;
}

/** A2A message sent between agents via Algorand transactions */
export interface A2AMessage {
  /** Unique message ID */
  id: string;
  /** Sender's Algorand address */
  from: string;
  /** Recipient's Algorand address */
  to: string;
  /** Message type */
  type: A2AMessageType;
  /** Message payload */
  payload: A2APayload;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Reference to a previous message (for replies) */
  inReplyTo?: string;
}

export type A2AMessageType =
  | 'task.create'
  | 'task.update'
  | 'task.complete'
  | 'task.cancel'
  | 'task.error'
  | 'agent.discover'
  | 'agent.card';

export interface A2APayload {
  /** Task ID (for task-related messages) */
  taskId?: string;
  /** The task content or result */
  content?: string;
  /** Structured data */
  data?: Record<string, unknown>;
  /** Skill being invoked */
  skillId?: string;
  /** Agent card (for discovery responses) */
  agentCard?: AgentCard;
}

/** Algorand transaction note prefix for A2A messages */
export const A2A_NOTE_PREFIX = 'a2a/v1';

/** Configuration for the Algorand A2A adapter */
export interface A2AAlgorandConfig {
  /** Algod client URL */
  algodUrl: string;
  /** Algod API token */
  algodToken: string;
  /** Indexer URL (for reading messages) */
  indexerUrl: string;
  /** Indexer API token */
  indexerToken: string;
  /** Agent's Algorand address */
  agentAddress: string;
  /** Function to sign transactions */
  signer: (txn: Uint8Array) => Promise<Uint8Array>;
  /** Minimum balance to send messages (microAlgos) */
  minBalance?: number;
  /** Poll interval for new messages (ms) */
  pollIntervalMs?: number;
}

/** Result of sending an A2A message on Algorand */
export interface SendResult {
  /** Algorand transaction ID */
  txId: string;
  /** The A2A message that was sent */
  message: A2AMessage;
  /** Round the transaction was confirmed in */
  confirmedRound?: number;
}

/** Callback for receiving messages */
export type MessageHandler = (message: A2AMessage) => void | Promise<void>;
