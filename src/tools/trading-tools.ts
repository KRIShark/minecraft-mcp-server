import { z } from 'zod';
import type mineflayer from 'mineflayer';
import type { Villager, VillagerTrade } from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';
import { resolveEntity, structured } from './tool-utils.js';

const openVillagers = new WeakMap<mineflayer.Bot, Villager>();

function item(item: VillagerTrade['inputItem1'] | null) {
  return item ? { name: item.name, displayName: item.displayName, count: item.count, metadata: item.metadata } : null;
}

function trades(villager: Villager) {
  return villager.trades.map((trade, index) => ({ index, inputItem1: item(trade.inputItem1), inputItem2: item(trade.inputItem2), outputItem: item(trade.outputItem), disabled: trade.tradeDisabled, uses: trade.nbTradeUses, maximumUses: trade.maximumNbTradeUses, xp: trade.xp, realPrice: trade.realPrice }));
}

export function registerTradingTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('open-villager', 'Open trading with a nearby villager and list its offers.', {
    entityId: z.coerce.number().int().optional(), maxDistance: z.coerce.number().positive().max(16).optional()
  }, async ({ entityId, maxDistance = 5 }: { entityId?: number; maxDistance?: number }) => {
    const bot = getBot();
    if (openVillagers.has(bot)) throw new Error('A villager trade window is already open. Close it first.');
    const entity = resolveEntity(bot, { entityId, type: entityId === undefined ? 'villager' : undefined, maxDistance });
    const villager = await bot.openVillager(entity);
    openVillagers.set(bot, villager);
    villager.once('close', () => openVillagers.delete(bot));
    return structured(factory, { success: true, entityId: entity.id, trades: trades(villager) });
  });

  factory.registerTool('list-villager-trades', 'List offers in the currently open villager trade window.', {}, async () => {
    const villager = openVillagers.get(getBot());
    if (!villager) throw new Error('No villager trade window is open.');
    return structured(factory, { trades: trades(villager) });
  });

  factory.registerTool('trade-with-villager', 'Execute an offer from the currently open villager by zero-based trade index.', {
    tradeIndex: z.coerce.number().int().nonnegative(), times: z.coerce.number().int().positive().max(64).optional()
  }, async ({ tradeIndex, times = 1 }) => {
    const bot = getBot();
    const villager = openVillagers.get(bot);
    if (!villager) throw new Error('No villager trade window is open.');
    if (!villager.trades[tradeIndex]) throw new Error(`Trade index ${tradeIndex} does not exist.`);
    await bot.trade(villager, tradeIndex, times);
    return structured(factory, { success: true, tradeIndex, times, trades: trades(villager) });
  });

  factory.registerTool('close-villager', 'Close the current villager trade window.', {}, async () => {
    const bot = getBot();
    const villager = openVillagers.get(bot);
    if (!villager) return structured(factory, { success: true, closed: false });
    await villager.close();
    openVillagers.delete(bot);
    return structured(factory, { success: true, closed: true });
  });
}
