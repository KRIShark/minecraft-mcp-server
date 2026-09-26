import type mineflayer from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { ToolFactory } from '../tool-factory.js';

export function structured(factory: ToolFactory, value: Record<string, unknown>) {
  const safeValue = JSON.parse(JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry)) as Record<string, unknown>;
  return { ...factory.createResponse(JSON.stringify(safeValue)), structuredContent: safeValue };
}

export function entityName(entity: Entity): string {
  return entity.username ?? entity.displayName ?? entity.name ?? entity.mobType ?? entity.type;
}

export function entitySummary(bot: mineflayer.Bot, entity: Entity) {
  return {
    id: entity.id,
    name: entityName(entity),
    type: entity.type,
    kind: entity.kind,
    position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
    distance: bot.entity.position.distanceTo(entity.position),
    health: entity.health,
    onGround: entity.onGround,
    heldItem: entity.heldItem?.name ?? null,
    equipment: (entity.equipment ?? []).filter(Boolean).map(item => ({ name: item.name, count: item.count }))
  };
}

export function resolveEntity(bot: mineflayer.Bot, options: { username?: string; entityId?: number; type?: string; maxDistance?: number }): Entity {
  const maxDistance = options.maxDistance ?? 32;
  let entity: Entity | undefined;
  if (options.username) entity = bot.players[options.username]?.entity;
  else if (options.entityId !== undefined) entity = bot.entities[options.entityId];
  else entity = bot.nearestEntity(candidate => {
    if (candidate === bot.entity) return false;
    if (!options.type) return true;
    const wanted = options.type.toLowerCase();
    return candidate.type === wanted || candidate.name?.toLowerCase() === wanted || candidate.mobType?.toLowerCase() === wanted;
  }) ?? undefined;
  if (!entity?.isValid) throw new Error('Target entity is not visible.');
  const distance = bot.entity.position.distanceTo(entity.position);
  if (distance > maxDistance) throw new Error(`Target is ${distance.toFixed(1)} blocks away (maximum ${maxDistance}).`);
  return entity;
}
