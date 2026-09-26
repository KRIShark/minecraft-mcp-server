import test from 'ava';
import { parseHttpConfig } from '../src/http-config.js';
import { startHttpServer } from '../src/http-server.js';

const config = (token?: string) => ({ minecraft: { host: '127.0.0.1', port: 25565, username: 'MCPBot' }, http: { host: '127.0.0.1', port: 0, path: '/custom-mcp', authToken: token } });
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };

async function request(url: string, body: unknown, token?: string, session?: string) {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify(body) });
}

test('HTTP config validates required values and paths', t => {
  t.throws(() => parseHttpConfig({}), { message: /MCP_PATH/ });
  t.throws(() => parseHttpConfig({ MINECRAFT_HOST: '127.0.0.1', MINECRAFT_PORT: '25565', MINECRAFT_USERNAME: 'MCPBot', MCP_HOST: '127.0.0.1', MCP_PORT: '3000', MCP_PATH: '/../x' }), { message: /MCP_PATH/ });
  t.is(parseHttpConfig({ MINECRAFT_HOST: '127.0.0.1', MINECRAFT_PORT: '25565', MINECRAFT_USERNAME: 'MCPBot', MCP_HOST: '127.0.0.1', MCP_PORT: '3000', MCP_PATH: '/mcp' }).http.port, 3000);
});

test('HTTP initialize and tools/list work without authentication', async t => {
  const runtime = await startHttpServer(config(), false);
  try {
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const url = `http://127.0.0.1:${address.port}/custom-mcp`;
    t.is((await fetch(`http://127.0.0.1:${address.port}/wrong`)).status, 404);
    const init = await request(url, initialize);
    t.is(init.status, 200);
    const session = init.headers.get('mcp-session-id');
    t.truthy(session);
    t.is((await init.json() as { result: { serverInfo: { name: string } } }).result.serverInfo.name, 'minecraft-mcp-server');
    const tools = await request(url, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, undefined, session!);
    t.is(tools.status, 200);
    const result = await tools.json() as { result: { tools: Array<{ name: string }> } };
    t.true(result.result.tools.some(tool => tool.name === 'open-container'));
    t.true(result.result.tools.some(tool => tool.name === 'withdraw-item'));
    await request(url, { broken: true }, undefined, session!);
    t.is((await request(url, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }, undefined, session!)).status, 200);
  } finally { await runtime.close(); }
});

test('HTTP bearer authentication rejects missing and invalid credentials', async t => {
  const runtime = await startHttpServer(config('example-secret'), false);
  try {
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const url = `http://127.0.0.1:${address.port}/custom-mcp`;
    t.is((await request(url, initialize)).status, 401);
    t.is((await request(url, initialize, 'wrong')).status, 401);
    t.is((await request(url, initialize, 'example-secret')).status, 200);
  } finally { await runtime.close(); }
});
