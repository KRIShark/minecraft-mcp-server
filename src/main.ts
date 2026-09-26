#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupStdioFiltering } from './stdio-filter.js';
import { log } from './logger.js';
import { parseConfig } from './config.js';
import { BotConnection } from './bot-connection.js';
import { MessageStore } from './message-store.js';
import { createMcpServer } from './mcp-server.js';

setupStdioFiltering();

async function main() {
  const messageStore = new MessageStore();
  const connection = new BotConnection(parseConfig(), { onLog: log, onChatMessage: (user, message) => messageStore.addMessage(user, message) });
  const server = createMcpServer(connection, messageStore);
  connection.connect();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    connection.cleanup();
    await server.close();
  };
  process.stdin.on('end', () => { void stop(); });
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  await server.connect(new StdioServerTransport());
}

main().catch(error => { log('error', `Fatal error: ${error}`); process.exitCode = 1; });
