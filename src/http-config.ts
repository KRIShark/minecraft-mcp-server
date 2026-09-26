import { isIP } from 'node:net';

export interface HttpConfig {
  minecraft: { host: string; port: number; username: string };
  http: { host: string; port: number; path: string; authToken?: string };
}

function port(value: string | undefined, name: string): number {
  const number = Number(value);
  if (!value || !/^\d+$/.test(value) || !Number.isInteger(number) || number < 1 || number > 65535) throw new Error(`${name} must be an integer TCP port from 1 to 65535.`);
  return number;
}

function host(value: string | undefined, name: string): string {
  if (!value || value.trim() !== value || !(isIP(value) || /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(value))) throw new Error(`${name} must be a valid IP address or hostname.`);
  return value;
}

export function parseHttpConfig(env: Record<string, string | undefined> = process.env): HttpConfig {
  const path = env.MCP_PATH;
  if (!path || !/^\/(?:[a-zA-Z0-9._~!$&'()+,;=:@%-]|\/)*$/.test(path) || path.includes('//') || path.includes('..') || path.includes('?') || path.includes('#')) throw new Error('MCP_PATH must be an absolute HTTP path such as /mcp.');
  const username = env.MINECRAFT_USERNAME;
  if (!username || !/^[A-Za-z0-9_]{1,16}$/.test(username)) throw new Error('MINECRAFT_USERNAME must be 1–16 Minecraft username characters.');
  return {
    minecraft: { host: host(env.MINECRAFT_HOST, 'MINECRAFT_HOST'), port: port(env.MINECRAFT_PORT, 'MINECRAFT_PORT'), username },
    http: { host: host(env.MCP_HOST, 'MCP_HOST'), port: port(env.MCP_PORT, 'MCP_PORT'), path, authToken: env.MCP_AUTH_TOKEN || undefined }
  };
}
