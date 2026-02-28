# a2a-algorand

A2A (Agent-to-Agent) protocol adapter for Algorand. Send and receive A2A messages between AI agents using Algorand transactions as the transport layer.

## Why?

The [A2A protocol](https://github.com/google/A2A) is an emerging standard for agent-to-agent communication. This library lets agents communicate over Algorand's blockchain, providing:

- **Immutable message history** — every message is an on-chain transaction
- **Cryptographic identity** — agents are identified by Algorand addresses
- **Decentralized discovery** — find agents by scanning for `agent.card` messages
- **Interoperability** — standard A2A message format, Algorand transport

## Install

```bash
npm install a2a-algorand algosdk
```

## Quick Start

```typescript
import { A2AAlgorandAdapter } from 'a2a-algorand';

const agent = new A2AAlgorandAdapter({
  algodUrl: 'https://testnet-api.4160.nodely.dev',
  algodToken: '',
  indexerUrl: 'https://testnet-idx.4160.nodely.dev',
  indexerToken: '',
  agentAddress: 'YOUR_ALGORAND_ADDRESS',
  signer: async (txn) => {
    // Sign with your key
    return signedTxnBytes;
  },
});

// Listen for messages
agent.onMessage(async (msg) => {
  console.log(`Received ${msg.type} from ${msg.from}`);
  if (msg.type === 'task.create') {
    await agent.completeTask(msg.from, msg.payload.taskId!, 'Done!');
  }
});

// Start listening
agent.startPolling();

// Send a task to another agent
await agent.createTask(
  'OTHER_AGENT_ADDRESS',
  'summarize',
  'Please summarize this document',
);
```

## Message Types

| Type | Description |
|------|-------------|
| `task.create` | Request another agent to perform a task |
| `task.update` | Progress update on a running task |
| `task.complete` | Task finished with results |
| `task.cancel` | Cancel a pending task |
| `task.error` | Task failed with an error |
| `agent.discover` | Request agent cards from the network |
| `agent.card` | Broadcast agent capabilities |

## How It Works

A2A messages are encoded in Algorand transaction note fields with the prefix `a2a/v1:`. The adapter sends 0-Algo payment transactions where the note carries the full A2A message payload. Incoming messages are discovered by polling the Algorand indexer for transactions with the `a2a/v1` note prefix.

## Status

Early development (v0.1.0). The core types and codec are stable. The adapter's transaction building will be migrated to use `algosdk` directly in v0.2.

## License

MIT
