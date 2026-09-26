import { z } from 'zod';
import type mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';
import { entitySummary, structured } from './tool-utils.js';

export function registerObservationTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('get-bot-status', 'Return health, food, oxygen, experience, position, movement, held item, game mode and world conditions.', {}, async () => {
    const bot = getBot();
    return structured(factory, {
      username: bot.username, version: bot.version, gameMode: bot.game.gameMode, dimension: bot.game.dimension,
      health: bot.health, food: bot.food, saturation: bot.foodSaturation, oxygen: bot.oxygenLevel,
      experience: bot.experience, position: bot.entity.position, velocity: bot.entity.velocity,
      yaw: bot.entity.yaw, pitch: bot.entity.pitch, onGround: bot.entity.onGround, isSleeping: bot.isSleeping,
      heldItem: bot.heldItem?.name ?? null, usingHeldItem: bot.usingHeldItem, quickBarSlot: bot.quickBarSlot,
      raining: bot.isRaining, thunderState: bot.thunderState, time: bot.time
    });
  });

  factory.registerTool('list-players', 'List known server players and visible player entities.', {}, async () => {
    const bot = getBot();
    return structured(factory, { players: Object.values(bot.players).map(player => ({
      username: player.username, uuid: player.uuid, ping: player.ping, gamemode: player.gamemode,
      visible: Boolean(player.entity), ...(player.entity ? { entity: entitySummary(bot, player.entity) } : {})
    })) });
  });

  factory.registerTool('inspect-player', 'Inspect a named visible player, including location, distance and visible equipment.', {
    username: z.string().min(1)
  }, async ({ username }: { username: string }) => {
    const bot = getBot();
    const player = bot.players[username];
    if (!player) throw new Error(`Unknown player: ${username}`);
    return structured(factory, { username, uuid: player.uuid, ping: player.ping, gamemode: player.gamemode, visible: Boolean(player.entity), ...(player.entity ? { entity: entitySummary(bot, player.entity) } : {}) });
  });

  factory.registerTool('list-nearby-entities', 'List nearby entities with IDs that can be used by interaction and combat tools.', {
    maxDistance: z.coerce.number().positive().max(128).optional(),
    type: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  }, async ({ maxDistance = 32, type, limit = 50 }: { maxDistance?: number; type?: string; limit?: number }) => {
    const bot = getBot();
    const entities = Object.values(bot.entities)
      .filter(entity => entity !== bot.entity && entity.isValid)
      .filter(entity => !type || entity.type === type || entity.name === type || entity.mobType === type)
      .filter(entity => bot.entity.position.distanceTo(entity.position) <= maxDistance)
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
      .slice(0, limit).map(entity => entitySummary(bot, entity));
    return structured(factory, { entities });
  });

  factory.registerTool('get-equipment', 'Return the bot held item, armor and off-hand equipment.', {}, async () => {
    const bot = getBot();
    const slots = ['hand', 'off-hand', 'feet', 'legs', 'torso', 'head'] as const;
    return structured(factory, { equipment: Object.fromEntries(slots.map(slot => [slot, bot.inventory.slots[bot.getEquipmentDestSlot(slot)] ? {
      name: bot.inventory.slots[bot.getEquipmentDestSlot(slot)]!.name,
      count: bot.inventory.slots[bot.getEquipmentDestSlot(slot)]!.count,
      slot: bot.getEquipmentDestSlot(slot)
    } : null])) });
  });
}
