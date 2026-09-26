import { z } from 'zod';
import type mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';
import { structured } from './tool-utils.js';

const destination = z.enum(['hand', 'off-hand', 'head', 'torso', 'legs', 'feet']);

export function registerPlayerActionTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('whisper-player', 'Send a private message to a player.', { username: z.string().min(1), message: z.string().min(1).max(256) }, async ({ username, message }) => {
    getBot().whisper(username, message);
    return structured(factory, { success: true, username, message });
  });

  factory.registerTool('unequip-item', 'Remove equipment from a body, hand or off-hand slot and return it to inventory.', { destination }, async ({ destination }) => {
    await getBot().unequip(destination);
    return structured(factory, { success: true, destination });
  });

  factory.registerTool('drop-item', 'Drop a count or all of an exact inventory item.', {
    item: z.string().min(1), count: z.coerce.number().int().positive().optional(), all: z.boolean().optional()
  }, async ({ item, count, all = false }: { item: string; count?: number; all?: boolean }) => {
    if (all === (count !== undefined)) throw new Error('Specify either count or all: true.');
    const bot = getBot();
    const matches = bot.inventory.items().filter(entry => entry.name === item);
    if (!matches.length) throw new Error(`${item} is not in inventory.`);
    const available = matches.reduce((sum, entry) => sum + entry.count, 0);
    const amount = all ? available : count!;
    if (amount > available) throw new Error(`Requested ${amount}, but only ${available} are available.`);
    await bot.toss(matches[0].type, matches[0].metadata, amount);
    return structured(factory, { success: true, item, dropped: amount });
  });

  factory.registerTool('select-hotbar-slot', 'Select a hotbar slot from 0 through 8.', { slot: z.coerce.number().int().min(0).max(8) }, async ({ slot }) => {
    getBot().setQuickBarSlot(slot);
    return structured(factory, { success: true, slot });
  });

  factory.registerTool('consume-held-item', 'Eat or drink the currently held consumable item.', {}, async () => {
    const bot = getBot();
    const item = bot.heldItem?.name;
    if (!item) throw new Error('The bot is not holding an item.');
    await bot.consume();
    return structured(factory, { success: true, consumed: item, health: bot.health, food: bot.food });
  });

  factory.registerTool('activate-held-item', 'Press use for the held item, such as drawing a bow, raising a shield, throwing an item or using a firework.', { offHand: z.boolean().optional() }, async ({ offHand = false }) => {
    const bot = getBot();
    bot.activateItem(offHand);
    return structured(factory, { success: true, offHand, heldItem: bot.heldItem?.name ?? null });
  });

  factory.registerTool('deactivate-held-item', 'Release the currently used item, such as releasing a drawn bow or lowering a shield.', {}, async () => {
    getBot().deactivateItem();
    return structured(factory, { success: true });
  });

  factory.registerTool('fish', 'Fish using the currently equipped fishing rod until a catch or failure.', {}, async () => {
    await getBot().fish();
    return structured(factory, { success: true });
  });

  factory.registerTool('swing-arm', 'Swing the selected arm without attacking.', { hand: z.enum(['left', 'right']).optional() }, async ({ hand = 'right' }) => {
    getBot().swingArm(hand);
    return structured(factory, { success: true, hand });
  });

  factory.registerTool('set-movement-state', 'Set sprinting, sneaking, jumping or directional movement on or off. Use clear-movement-states when done.', {
    control: z.enum(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']), enabled: z.boolean()
  }, async ({ control, enabled }) => {
    getBot().setControlState(control, enabled);
    return structured(factory, { success: true, control, enabled });
  });

  factory.registerTool('clear-movement-states', 'Stop all manual movement controls.', {}, async () => {
    getBot().clearControlStates();
    return structured(factory, { success: true });
  });
}
