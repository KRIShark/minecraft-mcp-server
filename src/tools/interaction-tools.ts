import { z } from 'zod';
import type mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { ToolFactory } from '../tool-factory.js';
import { entityName, resolveEntity, structured } from './tool-utils.js';

const targetSchema = {
  username: z.string().min(1).optional(), entityId: z.coerce.number().int().optional(), type: z.string().optional(),
  maxDistance: z.coerce.number().positive().max(32).optional()
};

export function registerInteractionTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('activate-block', 'Right-click a nearby block, such as a door, button, lever, bell or note block.', {
    x: z.coerce.number().finite(), y: z.coerce.number().finite(), z: z.coerce.number().finite()
  }, async ({ x, y, z }) => {
    const bot = getBot();
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block) throw new Error('The target block is not loaded.');
    if (bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) > 5) throw new Error('Block is out of interaction range.');
    await bot.activateBlock(block);
    return structured(factory, { success: true, block: block.name, position: block.position });
  });

  factory.registerTool('interact-with-entity', 'Right-click a visible entity, such as a villager, animal or vehicle.', targetSchema, async (args) => {
    const bot = getBot();
    const entity = resolveEntity(bot, { ...args, maxDistance: args.maxDistance ?? 5 });
    await bot.activateEntity(entity);
    return structured(factory, { success: true, target: entityName(entity), entityId: entity.id });
  });

  factory.registerTool('use-held-item-on-entity', 'Use the held item on a visible entity, such as shears, a lead, saddle or name tag.', targetSchema, async (args) => {
    const bot = getBot();
    if (!bot.heldItem) throw new Error('The bot is not holding an item.');
    const entity = resolveEntity(bot, { ...args, maxDistance: args.maxDistance ?? 5 });
    bot.useOn(entity);
    return structured(factory, { success: true, item: bot.heldItem.name, target: entityName(entity), entityId: entity.id });
  });

  factory.registerTool('mount-entity', 'Mount a nearby rideable entity or vehicle.', targetSchema, async (args) => {
    const bot = getBot();
    const entity = resolveEntity(bot, { ...args, maxDistance: args.maxDistance ?? 5 });
    bot.mount(entity);
    await bot.waitForTicks(2);
    return structured(factory, { success: true, target: entityName(entity), entityId: entity.id, mounted: bot.entity.vehicle?.id === entity.id });
  });

  factory.registerTool('dismount', 'Dismount the current vehicle or ridden entity.', {}, async () => {
    const bot = getBot();
    if (!bot.entity.vehicle) throw new Error('The bot is not mounted.');
    bot.dismount();
    return structured(factory, { success: true });
  });

  factory.registerTool('move-vehicle', 'Steer the currently mounted vehicle. Values range from -1 to 1.', {
    left: z.coerce.number().min(-1).max(1), forward: z.coerce.number().min(-1).max(1)
  }, async ({ left, forward }) => {
    const bot = getBot();
    if (!bot.entity.vehicle) throw new Error('The bot is not mounted.');
    bot.moveVehicle(left, forward);
    return structured(factory, { success: true, left, forward });
  });

  factory.registerTool('sleep-in-bed', 'Sleep in a nearby bed at the given coordinates.', {
    x: z.coerce.number().finite(), y: z.coerce.number().finite(), z: z.coerce.number().finite()
  }, async ({ x, y, z }) => {
    const bot = getBot();
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block || !bot.isABed(block)) throw new Error('No bed is loaded at those coordinates.');
    await bot.sleep(block);
    return structured(factory, { success: true, position: block.position });
  });

  factory.registerTool('wake-up', 'Leave the bed when sleeping.', {}, async () => {
    const bot = getBot();
    if (!bot.isSleeping) throw new Error('The bot is not sleeping.');
    await bot.wake();
    return structured(factory, { success: true });
  });

  factory.registerTool('update-sign', 'Write up to four lines on a nearby sign.', {
    x: z.coerce.number().finite(), y: z.coerce.number().finite(), z: z.coerce.number().finite(),
    lines: z.array(z.string().max(45)).min(1).max(4), back: z.boolean().optional()
  }, async ({ x, y, z, lines, back = false }) => {
    const bot = getBot();
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block || !block.name.includes('sign')) throw new Error('No sign is loaded at those coordinates.');
    if (bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) > 5) throw new Error('Sign is out of interaction range.');
    bot.updateSign(block, lines.join('\n'), back);
    return structured(factory, { success: true, position: block.position, lines, back });
  });
}
