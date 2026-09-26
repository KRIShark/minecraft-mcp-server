import test from 'ava';
import { EventEmitter } from 'node:events';
import sinon from 'sinon';
import type mineflayer from 'mineflayer';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolFactory } from '../src/tool-factory.js';
import type { BotConnection } from '../src/bot-connection.js';
import { registerContainerTools } from '../src/tools/container-tools.js';

function fixture(blockName = 'chest') {
  const calls = new Map<string, (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> }>>();
  const server = { tool: (name: string, _description: string, _schema: unknown, handler: (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> }>) => { calls.set(name, handler); } } as unknown as McpServer;
  const connection = { checkConnectionAndReconnect: async () => ({ connected: true }) } as BotConnection;
  const bot = new EventEmitter() as unknown as mineflayer.Bot;
  const position = { x: 1, y: 2, z: 3, offset: () => ({ x: 1.5, y: 2.5, z: 3.5 }) };
  bot.entity = { position: { distanceTo: () => 1 } } as unknown as mineflayer.Bot['entity'];
  bot.blockAt = () => ({ name: blockName, position }) as unknown as ReturnType<mineflayer.Bot['blockAt']>;
  const item = { name: 'stone', displayName: 'Stone', count: 10, slot: 9, type: 1, metadata: 0, stackSize: 64 };
  const window = { id: 7, inventoryStart: 9, inventoryEnd: 45, slots: Array(45).fill(null), close: sinon.stub().callsFake(async () => { bot.currentWindow = null; bot.emit('windowClose', window as never); }), deposit: sinon.stub().callsFake(async (_type: number, _metadata: number, count: number) => { item.count -= count; window.slots[0] = { ...item, count }; }), withdraw: sinon.stub().callsFake(async (_type: number, _metadata: number, count: number) => { const source = window.slots[0] as typeof item; source.count -= count; item.count += count; }) };
  window.slots[9] = item;
  bot.currentWindow = null;
  bot.openContainer = sinon.stub().callsFake(async () => { bot.currentWindow = window as never; return window; });
  registerContainerTools(new ToolFactory(server, connection), () => bot);
  const call = (name: string, args: unknown = {}) => calls.get(name)!(args);
  return { bot, window, calls, call };
}

test('registers five container tools and validates coordinates', async t => {
  const f = fixture();
  t.deepEqual([...f.calls.keys()], ['open-container', 'get-container-contents', 'deposit-item', 'withdraw-item', 'close-container']);
  t.true((await f.call('open-container', { x: 1.5, y: 2, z: 3 })).isError);
  t.true((await f.call('open-container', { x: 'bad', y: 2, z: 3 })).isError);
  t.true((await f.call('get-container-contents')).isError);
});

test('rejects non-containers and opens confirmed windows', async t => {
  const bad = fixture('dirt');
  t.true((await bad.call('open-container', { x: 1, y: 2, z: 3 })).isError);
  const missing = fixture();
  missing.bot.blockAt = () => null;
  t.true((await missing.call('open-container', { x: 1, y: 2, z: 3 })).isError);
  const f = fixture();
  const result = await f.call('open-container', { x: 1, y: 2, z: 3 });
  t.is(result.structuredContent?.windowId, 7);
  t.is((result.structuredContent?.playerInventory as unknown[]).length, 1);
});

test('close clears state and subsequent close reports no container', async t => {
  const f = fixture();
  await f.call('open-container', { x: 1, y: 2, z: 3 });
  t.is((await f.call('close-container')).structuredContent?.closed, true);
  t.is((await f.call('close-container')).structuredContent?.closed, false);
});

test('validates transfers, quantity and cleanup', async t => {
  const f = fixture();
  await f.call('open-container', { x: 1, y: 2, z: 3 });
  t.true((await f.call('deposit-item', { item: 'stone', count: 0 })).isError);
  t.true((await f.call('withdraw-item', { item: 'stone', count: -1 })).isError);
  t.true((await f.call('deposit-item', { item: 'diamond', count: 1 })).isError);
  t.true((await f.call('withdraw-item', { item: 'diamond', count: 1 })).isError);
  t.true((await f.call('deposit-item', { item: 'stone', count: 100 })).isError);
  t.is((await f.call('deposit-item', { item: 'stone', count: 3 })).structuredContent?.transferredAmount, 3);
  t.is((await f.call('withdraw-item', { item: 'stone', count: 2 })).structuredContent?.transferredAmount, 2);
  f.bot.emit('windowClose', f.window as never);
  t.true((await f.call('get-container-contents')).isError);
  t.is((await f.call('close-container')).structuredContent?.closed, false);
});

test('serializes transfers and clears state on disconnect', async t => {
  const f = fixture();
  await f.call('open-container', { x: 1, y: 2, z: 3 });
  const order: string[] = [];
  const original = f.window.deposit;
  f.window.deposit = sinon.stub().callsFake(async (...args: Parameters<typeof original>) => { order.push('start'); await new Promise(resolve => setTimeout(resolve, 20)); await original(...args); order.push('end'); });
  await Promise.all([f.call('deposit-item', { item: 'stone', count: 1 }), f.call('deposit-item', { item: 'stone', count: 1 })]);
  t.deepEqual(order, ['start', 'end', 'start', 'end']);
  f.bot.emit('end', 'test');
  t.true((await f.call('get-container-contents')).isError);
});
