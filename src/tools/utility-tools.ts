import { z } from 'zod';
import type mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { ToolFactory } from '../tool-factory.js';
import { structured } from './tool-utils.js';

export function registerUtilityTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('estimate-dig-time', 'Estimate milliseconds needed to break a loaded block with the currently held tool.', {
    x: z.coerce.number().finite(), y: z.coerce.number().finite(), z: z.coerce.number().finite()
  }, async ({ x, y, z }) => {
    const bot = getBot();
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block) throw new Error('The target block is not loaded.');
    return structured(factory, { block: block.name, position: block.position, canDig: bot.canDigBlock(block), milliseconds: bot.digTime(block), heldItem: bot.heldItem?.name ?? null });
  });

  factory.registerTool('stop-digging', 'Cancel the current block digging action.', {}, async () => {
    getBot().stopDigging();
    return structured(factory, { success: true });
  });

  factory.registerTool('start-elytra-flight', 'Activate elytra flight when equipped and airborne.', {}, async () => {
    await getBot().elytraFly();
    return structured(factory, { success: true });
  });

  factory.registerTool('write-book', 'Write pages into a writable book in the specified inventory slot.', {
    slot: z.coerce.number().int().nonnegative(), pages: z.array(z.string().max(1024)).min(1).max(100)
  }, async ({ slot, pages }) => {
    const bot = getBot();
    const inventoryItem = bot.inventory.slots[slot];
    if (!inventoryItem || inventoryItem.name !== 'writable_book') throw new Error(`Slot ${slot} does not contain a writable_book.`);
    await bot.writeBook(slot, pages);
    return structured(factory, { success: true, slot, pageCount: pages.length });
  });

  factory.registerTool('move-inventory-slot', 'Move an item stack between two slots in the current inventory or open window.', {
    sourceSlot: z.coerce.number().int().nonnegative(), destinationSlot: z.coerce.number().int().nonnegative()
  }, async ({ sourceSlot, destinationSlot }) => {
    const bot = getBot();
    const window = bot.currentWindow ?? bot.inventory;
    if (sourceSlot >= window.slots.length || destinationSlot >= window.slots.length) throw new Error('A slot is outside the current window.');
    if (!window.slots[sourceSlot]) throw new Error(`Source slot ${sourceSlot} is empty.`);
    await bot.moveSlotItem(sourceSlot, destinationSlot);
    return structured(factory, { success: true, sourceSlot, destinationSlot });
  });

  factory.registerTool('complete-chat-input', 'Ask the Minecraft server for chat or command completions.', {
    input: z.string().min(1), assumeCommand: z.boolean().optional(), timeoutMs: z.coerce.number().int().min(100).max(10000).optional()
  }, async ({ input, assumeCommand = false, timeoutMs = 2000 }) => {
    const matches = await getBot().tabComplete(input, assumeCommand, false, timeoutMs);
    return structured(factory, { input, matches });
  });

  factory.registerTool('list-scoreboards', 'List known scoreboards and their current entries.', {}, async () => {
    const bot = getBot();
    return structured(factory, { scoreboards: Object.values(bot.scoreboards).map(board => ({ name: board.name, title: board.title?.toString?.() ?? String(board.title), items: board.items.map(entry => ({ name: entry.name, value: entry.value })) })) });
  });

  factory.registerTool('list-teams', 'List known teams and their members.', {}, async () => {
    const bot = getBot();
    return structured(factory, { teams: Object.values(bot.teams).map(team => ({ team: team.team, name: team.name?.toString?.() ?? String(team.name), friendlyFire: team.friendlyFire, nameTagVisibility: team.nameTagVisibility, collisionRule: team.collisionRule, color: team.color, prefix: team.prefix?.toString?.() ?? String(team.prefix), suffix: team.suffix?.toString?.() ?? String(team.suffix), members: team.members })) });
  });
}
