import { z } from 'zod';
import type mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { ToolFactory } from '../tool-factory.js';
import { entityName, resolveEntity, structured } from './tool-utils.js';

const { goals } = pathfinderPkg;

export function registerNavigationTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('follow-entity', 'Continuously follow a visible player or entity until stop-navigation is called.', {
    username: z.string().min(1).optional(), entityId: z.coerce.number().int().optional(), type: z.string().optional(),
    range: z.coerce.number().positive().max(16).optional(), maxDistance: z.coerce.number().positive().max(128).optional()
  }, async (args: { username?: string; entityId?: number; type?: string; range?: number; maxDistance?: number }) => {
    const bot = getBot();
    const entity = resolveEntity(bot, args);
    const range = args.range ?? 2;
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, range), true);
    return structured(factory, { success: true, target: entityName(entity), entityId: entity.id, range });
  });

  factory.registerTool('stop-navigation', 'Stop pathfinding or following and clear manual movement controls.', {}, async () => {
    const bot = getBot();
    bot.pathfinder.stop();
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    return structured(factory, { success: true });
  });

  factory.registerTool('navigation-status', 'Report whether pathfinding is active and the current goal type.', {}, async () => {
    const bot = getBot();
    return structured(factory, { moving: bot.pathfinder.isMoving(), goal: bot.pathfinder.goal?.constructor.name ?? null, controlState: bot.controlState });
  });

  factory.registerTool('look-at-entity', 'Look directly at a visible player or entity.', {
    username: z.string().min(1).optional(), entityId: z.coerce.number().int().optional(), type: z.string().optional(), maxDistance: z.coerce.number().positive().max(128).optional()
  }, async (args: { username?: string; entityId?: number; type?: string; maxDistance?: number }) => {
    const bot = getBot();
    const entity = resolveEntity(bot, args);
    await bot.lookAt(entity.position.offset(0, entity.height * 0.75, 0), true);
    return structured(factory, { success: true, target: entityName(entity), entityId: entity.id });
  });

  factory.registerTool('collect-nearby-item', 'Pathfind to a nearby dropped item so normal Minecraft pickup can collect it.', {
    item: z.string().optional(), maxDistance: z.coerce.number().positive().max(64).optional(), timeoutMs: z.coerce.number().int().min(250).max(60000).optional()
  }, async ({ item, maxDistance = 32, timeoutMs = 15000 }: { item?: string; maxDistance?: number; timeoutMs?: number }) => {
    const bot = getBot();
    const entity = bot.nearestEntity(candidate => {
      if (candidate.name !== 'item' && candidate.objectType !== 'Item') return false;
      const dropped = candidate.getDroppedItem?.();
      return !item || dropped?.name === item;
    });
    if (!entity || bot.entity.position.distanceTo(entity.position) > maxDistance) throw new Error(`No matching dropped item within ${maxDistance} blocks.`);
    const dropped = entity.getDroppedItem?.();
    const before = dropped ? bot.inventory.count(dropped.type, dropped.metadata) : undefined;
    const movement = bot.pathfinder.goto(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 1));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([movement, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Item collection timed out.')), timeoutMs); })]);
      await bot.waitForTicks(10);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const after = dropped ? bot.inventory.count(dropped.type, dropped.metadata) : undefined;
    return structured(factory, { success: true, item: dropped?.name ?? item ?? 'unknown', collected: before !== undefined && after !== undefined ? Math.max(0, after - before) : null });
  });
}
