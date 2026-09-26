import test from 'ava';
import sinon from 'sinon';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import type { BotConnection } from '../src/bot-connection.js';
import { ToolFactory } from '../src/tool-factory.js';
import { registerObservationTools } from '../src/tools/observation-tools.js';
import { registerPlayerActionTools } from '../src/tools/player-action-tools.js';
import { registerNavigationTools } from '../src/tools/navigation-tools.js';
import { registerInteractionTools } from '../src/tools/interaction-tools.js';
import { registerCombatTools } from '../src/tools/combat-tools.js';
import { registerTradingTools } from '../src/tools/trading-tools.js';
import { registerUtilityTools } from '../src/tools/utility-tools.js';

function setup(bot: mineflayer.Bot) {
  type Response = { content: Array<{ text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
  const calls = new Map<string, (args: unknown) => Promise<Response>>();
  const server = { tool: (name: string, _description: string, _schema: unknown, handler: (args: unknown) => Promise<Response>) => calls.set(name, handler) } as unknown as McpServer;
  const connection = { checkConnectionAndReconnect: sinon.stub().resolves({ connected: true }) } as unknown as BotConnection;
  const factory = new ToolFactory(server, connection);
  const getBot = () => bot;
  registerObservationTools(factory, getBot);
  registerPlayerActionTools(factory, getBot);
  registerNavigationTools(factory, getBot);
  registerInteractionTools(factory, getBot);
  registerCombatTools(factory, getBot);
  registerTradingTools(factory, getBot);
  registerUtilityTools(factory, getBot);
  return { calls, call: (name: string, args: unknown = {}) => calls.get(name)!(args) };
}

test('player capability modules register the complete public tool set', t => {
  const { calls } = setup({} as mineflayer.Bot);
  const expected = [
    'get-bot-status', 'list-players', 'inspect-player', 'list-nearby-entities', 'get-equipment',
    'whisper-player', 'unequip-item', 'drop-item', 'select-hotbar-slot', 'consume-held-item', 'activate-held-item',
    'deactivate-held-item', 'fish', 'swing-arm', 'set-movement-state', 'clear-movement-states',
    'follow-entity', 'stop-navigation', 'navigation-status', 'look-at-entity', 'collect-nearby-item',
    'activate-block', 'interact-with-entity', 'use-held-item-on-entity', 'mount-entity', 'dismount', 'move-vehicle',
    'sleep-in-bed', 'wake-up', 'update-sign', 'attack-entity-once', 'start-combat', 'stop-combat', 'combat-status',
    'open-villager', 'list-villager-trades', 'trade-with-villager', 'close-villager',
    'estimate-dig-time', 'stop-digging', 'start-elytra-flight', 'write-book', 'move-inventory-slot',
    'complete-chat-input', 'list-scoreboards', 'list-teams'
  ];
  t.deepEqual([...calls.keys()].sort(), expected.sort());
});

test('get-bot-status returns structured survival state', async t => {
  const bot = {
    username: 'MCPBot', version: '1.21.11', game: { gameMode: 'survival', dimension: 'overworld' },
    health: 18, food: 17, foodSaturation: 3, oxygenLevel: 20, experience: { level: 4, points: 10, progress: 0.2 },
    entity: { position: new Vec3(1, 64, 2), velocity: new Vec3(0, 0, 0), yaw: 0, pitch: 0, onGround: true },
    isSleeping: false, heldItem: null, usingHeldItem: false, quickBarSlot: 2, isRaining: false, thunderState: 0, time: { age: 1000n, timeOfDay: 1000 }
  } as unknown as mineflayer.Bot;
  const result = await setup(bot).call('get-bot-status');
  const status = result.structuredContent as { health: number; position: { x: number }; gameMode: string; time: { age: string } };
  t.is(status.health, 18);
  t.is(status.position.x, 1);
  t.is(status.gameMode, 'survival');
  t.is(status.time.age, '1000');
});

test('drop-item validates quantity and uses the Mineflayer toss API', async t => {
  const toss = sinon.stub().resolves();
  const bot = { inventory: { items: () => [{ name: 'cobblestone', type: 1, metadata: 0, count: 12 }] }, toss } as unknown as mineflayer.Bot;
  const tools = setup(bot);
  const result = await tools.call('drop-item', { item: 'cobblestone', count: 5 });
  t.true(toss.calledOnceWith(1, 0, 5));
  t.is((result.structuredContent as { dropped: number }).dropped, 5);
  t.true((await tools.call('drop-item', { item: 'cobblestone', count: 20 })).isError);
});

test('attack-entity-once resolves a player and attacks in reach', async t => {
  const attack = sinon.stub();
  const lookAt = sinon.stub().resolves();
  const target = { id: 7, username: 'Alex', type: 'player', isValid: true, height: 1.8, position: new Vec3(2, 64, 0) };
  const bot = {
    entity: { position: new Vec3(0, 64, 0) }, players: { Alex: { entity: target } }, entities: { 7: target },
    inventory: { items: () => [] }, heldItem: null, attack, lookAt
  } as unknown as mineflayer.Bot;
  const result = await setup(bot).call('attack-entity-once', { username: 'Alex' });
  t.true(attack.calledOnceWith(target));
  t.true(lookAt.calledOnce);
  t.is((result.structuredContent as { target: string }).target, 'Alex');
});
