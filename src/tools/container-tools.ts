import { z } from 'zod';
import type mineflayer from 'mineflayer';
import type { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import { ToolFactory } from '../tool-factory.js';

type Container = mineflayer.Chest | mineflayer.Dispenser;
type Active = { window: Container; type: string; position: { x: number; y: number; z: number } };
type State = { active?: Active; queue: Promise<void> };
const states = new WeakMap<mineflayer.Bot, State>();
const supported = new Set(['chest', 'trapped_chest', 'barrel', 'dispenser', 'dropper', 'hopper', 'ender_chest']);
const isSupported = (name: string) => supported.has(name) || name.endsWith('_shulker_box') || name === 'shulker_box';

function stateFor(bot: mineflayer.Bot): State {
  let state = states.get(bot);
  if (!state) {
    state = { queue: Promise.resolve() };
    states.set(bot, state);
    bot.on('windowClose', window => { if (state?.active?.window === window) state.active = undefined; });
    bot.on('end', () => { if (state) state.active = undefined; });
    bot.on('death', () => { if (state) state.active = undefined; });
  }
  return state;
}

function serial<T>(state: State, work: () => Promise<T>): Promise<T> {
  const result = state.queue.then(work);
  state.queue = result.then(() => undefined, () => undefined);
  return result;
}

function current(bot: mineflayer.Bot, state: State): Active {
  if (!state.active) throw new Error('No active container. Use open-container first.');
  if (bot.currentWindow !== state.active.window) {
    state.active = undefined;
    throw new Error('Container unexpectedly closed. Open it again.');
  }
  return state.active;
}

function itemInfo(item: Item) {
  return { name: item.name, displayName: item.displayName, count: item.count, slot: item.slot, type: item.type, metadata: item.metadata };
}

function snapshot(active: Active) {
  const { window } = active;
  return {
    success: true, containerType: active.type, position: active.position, windowId: window.id,
    containerInventory: window.slots.slice(0, window.inventoryStart).filter((item): item is Item => item !== null).map(itemInfo),
    playerInventory: window.slots.slice(window.inventoryStart, window.inventoryEnd).filter((item): item is Item => item !== null).map(itemInfo)
  };
}

function response(factory: ToolFactory, value: Record<string, unknown>, error = false) {
  return { ...factory.createResponse(JSON.stringify(value)), structuredContent: value, ...(error ? { isError: true } : {}) };
}

function failure(factory: ToolFactory, error: unknown) {
  return response(factory, { success: false, error: error instanceof Error ? error.message : String(error) }, true);
}

function matching(items: Item[], name: string, metadata?: number): Item[] {
  const found = items.filter(item => item.name === name && (metadata === undefined || item.metadata === metadata));
  if (metadata === undefined && new Set(found.map(item => item.metadata)).size > 1) {
    throw new Error(`Multiple metadata variants of ${name}; specify metadata.`);
  }
  return found;
}

function capacity(slots: Array<Item | null>, type: number, metadata: number, stackSize: number): number {
  return slots.reduce((sum, slot) => sum + (slot === null ? stackSize : slot.type === type && slot.metadata === metadata ? Math.max(0, slot.stackSize - slot.count) : 0), 0);
}

export function registerContainerTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  const guarded = async (bot: mineflayer.Bot, work: (state: State) => Promise<Record<string, unknown>>) => {
    const state = stateFor(bot);
    try { return response(factory, await serial(state, () => work(state))); }
    catch (error) { return failure(factory, error); }
  };

  factory.registerTool('open-container', 'Open a nearby chest, trapped chest, barrel, shulker box or other supported storage block at integer coordinates. Returns separate container and player inventories.', {
    x: z.number().int().finite(), y: z.number().int().finite(), z: z.number().int().finite()
  }, async ({ x, y, z }: { x: number; y: number; z: number }) => guarded(getBot(), async state => {
    const bot = getBot();
    if (state.active && bot.currentWindow === state.active.window) throw new Error('A container is already open. Close it first.');
    state.active = undefined;
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block || block.name === 'air') throw new Error('No block at the requested coordinates.');
    if (!isSupported(block.name)) throw new Error(`Unsupported or non-container block: ${block.name}`);
    if (!bot.entity?.position || bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) > 5) throw new Error('Container is out of reach (move within 5 blocks).');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const opened = bot.openContainer(block);
    opened.then(window => { if (timedOut && bot.currentWindow === window) void Promise.resolve().then(() => window.close()).catch(() => undefined); }).catch(() => undefined);
    let window: Container;
    try {
      window = await Promise.race([opened, new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('Timed out opening container.')); }, 10000); })]);
    } catch (error) {
      if (bot.currentWindow) {
        try { await bot.closeWindow(bot.currentWindow); } catch { /* preserve the original open failure */ }
      }
      throw error;
    } finally { if (timer) clearTimeout(timer); }
    if (bot.currentWindow !== window) throw new Error('Mineflayer did not confirm an open container window.');
    state.active = { window, type: block.name, position: { x, y, z } };
    return snapshot(state.active);
  }));

  factory.registerTool('get-container-contents', 'Return the currently open container contents and player inventory as separate lists.', {}, async () => guarded(getBot(), async state => snapshot(current(getBot(), state))));

  const transferSchema = { item: z.string().trim().min(1).regex(/^[a-z0-9_]+$/).describe('Exact Minecraft item name'), count: z.number().int().positive().optional().describe('Amount; omit when all is true'), all: z.boolean().optional().describe('Transfer all matching items'), metadata: z.number().int().nonnegative().optional().describe('Metadata variant, if needed') };
  for (const direction of ['deposit', 'withdraw'] as const) {
    factory.registerTool(`${direction}-item`, `${direction === 'deposit' ? 'Move items from player inventory into' : 'Move items from'} the open container${direction === 'withdraw' ? ' into player inventory' : ''}. Uses an exact item name and verifies the resulting quantities.`, transferSchema,
      async ({ item, count, all = false, metadata }: { item: string; count?: number; all?: boolean; metadata?: number }) => guarded(getBot(), async state => {
        if (all === (count !== undefined)) throw new Error('Specify either a positive count or all: true.');
        const active = current(getBot(), state);
        const window = active.window;
        const source = direction === 'deposit' ? window.slots.slice(window.inventoryStart, window.inventoryEnd) : window.slots.slice(0, window.inventoryStart);
        const destination = direction === 'deposit' ? window.slots.slice(0, window.inventoryStart) : window.slots.slice(window.inventoryStart, window.inventoryEnd);
        const found = matching(source.filter((entry): entry is Item => entry !== null), item, metadata);
        if (!found.length) throw new Error(`${item} is not present in the ${direction === 'deposit' ? 'player inventory' : 'container'}.`);
        const available = found.reduce((sum, entry) => sum + entry.count, 0);
        const requested = all ? available : count!;
        if (available < requested) throw new Error(`Insufficient ${item}: requested ${requested}, available ${available}.`);
        const selected = found[0];
        if (capacity(destination, selected.type, selected.metadata, selected.stackSize) < requested) throw new Error(`${direction === 'deposit' ? 'Container' : 'Player'} inventory is full or has insufficient capacity.`);
        const beforeSource = available;
        const beforeDestination = matching(destination.filter((entry): entry is Item => entry !== null), item, selected.metadata).reduce((sum, entry) => sum + entry.count, 0);
        await window[direction](selected.type, selected.metadata, requested);
        if (getBot().currentWindow !== window) { state.active = undefined; throw new Error('Container closed during transfer; inspect inventory before retrying.'); }
        const after = snapshot(active);
        const sourceItems = direction === 'deposit' ? after.playerInventory : after.containerInventory;
        const destinationItems = direction === 'deposit' ? after.containerInventory : after.playerInventory;
        const remaining = sourceItems.filter(entry => entry.name === item && entry.metadata === selected.metadata).reduce((sum, entry) => sum + entry.count, 0);
        const resulting = destinationItems.filter(entry => entry.name === item && entry.metadata === selected.metadata).reduce((sum, entry) => sum + entry.count, 0);
        const transferred = beforeSource - remaining;
        if (transferred !== requested || resulting - beforeDestination !== requested) throw new Error(`Transfer could not be fully verified: requested ${requested}, observed ${transferred}. Inspect inventories before retrying.`);
        return { ...after, requestedItem: item, requestedAmount: requested, transferredAmount: transferred, remainingSourceAmount: remaining, resultingDestinationAmount: resulting };
      }));
  }

  factory.registerTool('close-container', 'Close the currently open container. Safe to call when none is open.', {}, async () => guarded(getBot(), async state => {
    if (!state.active || getBot().currentWindow !== state.active.window) { state.active = undefined; return { success: true, closed: false, message: 'No container was open.' }; }
    const window = state.active.window;
    await window.close();
    if (getBot().currentWindow === window) throw new Error('Container close was not confirmed.');
    state.active = undefined;
    return { success: true, closed: true };
  }));
}
