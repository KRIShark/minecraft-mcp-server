import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { HttpConfig } from './http-config.js';
import { BotConnection } from './bot-connection.js';
import { MessageStore } from './message-store.js';
import { createMcpServer } from './mcp-server.js';
import { log } from './logger.js';

function authorized(req: IncomingMessage, token?: string): boolean {
  if (!token) return true;
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function startHttpServer(config: HttpConfig, connectBot = true): Promise<{ server: Server; connection: BotConnection; close: () => Promise<void> }> {
  const messages = new MessageStore();
  const connection = new BotConnection(config.minecraft, { onLog: log, onChatMessage: (user, message) => messages.addMessage(user, message) });
  if (connectBot) connection.connect();
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; mcp: ReturnType<typeof createMcpServer> }>();
  let closing = false;

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (new URL(req.url || '/', 'http://localhost').pathname !== config.http.path) { res.writeHead(404).end(); return; }
    if (!authorized(req, config.http.authToken)) { res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end(); return; }
    const origin = req.headers.origin;
    if (origin) {
      let originHost: string;
      try { originHost = new URL(origin).host; } catch { res.writeHead(403).end(); return; }
      if (originHost !== req.headers.host) { res.writeHead(403).end(); return; }
    }
    if (closing) { res.writeHead(503).end(); return; }
    const sessionId = req.headers['mcp-session-id'];
    const id = typeof sessionId === 'string' ? sessionId : undefined;
    let session = id ? sessions.get(id) : undefined;
    if (!session && id) { res.writeHead(404).end(); return; }
    if (!session && req.method !== 'POST') { res.writeHead(400).end(); return; }
    if (!session && sessions.size >= 32) { res.writeHead(503).end(); return; }
    const newSession = !session;
    if (!session) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: sessionId => { sessions.set(sessionId, { transport, mcp }); },
        onsessionclosed: sessionId => { sessions.delete(sessionId); }
      });
      const mcp = createMcpServer(connection, messages);
      session = { transport, mcp };
      await mcp.connect(transport);
    }
    await session.transport.handleRequest(req, res);
    if (newSession && !session.transport.sessionId) await session.mcp.close();
  };

  const server = createServer((req, res) => { void handle(req, res).catch(error => { log('error', `[HTTP] Request failed: ${error instanceof Error ? error.message : String(error)}`); if (!res.headersSent) res.writeHead(500).end(); else res.end(); }); });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.http.port, config.http.host, () => { server.off('error', reject); resolve(); }); });
  } catch (error) { connection.cleanup(); throw error; }
  const close = async () => {
    if (closing) return;
    closing = true;
    connection.cleanup();
    await Promise.allSettled([...sessions.values()].map(async ({ mcp }) => mcp.close()));
    sessions.clear();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  return { server, connection, close };
}
