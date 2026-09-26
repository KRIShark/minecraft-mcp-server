import { z } from 'zod';
import type mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import type { Entity } from 'prismarine-entity';
import { ToolFactory } from '../tool-factory.js';
import { entityName, resolveEntity, structured } from './tool-utils.js';

const { goals } = pathfinderPkg;
type CombatState = { target?: Entity; timer?: ReturnType<typeof setInterval>; attacks: number; busy: boolean; attackRange: number; maxDistance: number };
const states = new WeakMap<mineflayer.Bot, CombatState>();

function stateFor(bot: mineflayer.Bot): CombatState {
  let state = states.get(bot);
  if (!state) {
    state = { attacks: 0, busy: false, attackRange: 3, maxDistance: 48 };
    states.set(bot, state);
    const stop = () => stopCombat(bot, state!);
    bot.on('death', stop);
    bot.on('end', stop);
  }
  return state;
}

function stopCombat(bot: mineflayer.Bot, state: CombatState): void {
  if (state.timer) clearInterval(state.timer);
  state.timer = undefined;
  state.target = undefined;
  state.busy = false;
  bot.pathfinder.stop();
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
}

async function equipWeapon(bot: mineflayer.Bot, requested?: string): Promise<string | null> {
  const items = bot.inventory.items();
  const item = requested
    ? items.find(candidate => candidate.name === requested || candidate.name.includes(requested))
    : items.find(candidate => candidate.name.endsWith('_sword')) ?? items.find(candidate => candidate.name.endsWith('_axe'));
  if (requested && !item) throw new Error(`Weapon ${requested} is not in inventory.`);
  if (item) await bot.equip(item, 'hand');
  return item?.name ?? bot.heldItem?.name ?? null;
}

const targetSchema = {
  username: z.string().min(1).optional(), entityId: z.coerce.number().int().optional(), type: z.string().optional(),
  maxDistance: z.coerce.number().positive().max(128).optional()
};

export function registerCombatTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool('attack-entity-once', 'Look at and perform one melee attack against a visible player or entity in reach.', {
    ...targetSchema, weapon: z.string().optional(), attackRange: z.coerce.number().positive().max(6).optional()
  }, async (args: { username?: string; entityId?: number; type?: string; maxDistance?: number; weapon?: string; attackRange?: number }) => {
    const bot = getBot();
    const range = args.attackRange ?? 3.2;
    const entity = resolveEntity(bot, { ...args, maxDistance: range });
    const weapon = await equipWeapon(bot, args.weapon);
    await bot.lookAt(entity.position.offset(0, entity.height * 0.75, 0), true);
    bot.attack(entity);
    return structured(factory, { success: true, target: entityName(entity), entityId: entity.id, weapon });
  });

  factory.registerTool('start-combat', 'Pursue and repeatedly melee-attack a visible player or entity until stopped, lost, dead or too far away.', {
    ...targetSchema, weapon: z.string().optional(), attackRange: z.coerce.number().positive().max(6).optional(),
    intervalMs: z.coerce.number().int().min(250).max(5000).optional()
  }, async (args: { username?: string; entityId?: number; type?: string; maxDistance?: number; weapon?: string; attackRange?: number; intervalMs?: number }) => {
    const bot = getBot();
    const state = stateFor(bot);
    stopCombat(bot, state);
    const entity = resolveEntity(bot, args);
    const weapon = await equipWeapon(bot, args.weapon);
    state.target = entity;
    state.attacks = 0;
    state.attackRange = args.attackRange ?? 3;
    state.maxDistance = args.maxDistance ?? 48;
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, Math.max(1.5, state.attackRange - 0.25)), true);
    state.timer = setInterval(() => {
      void (async () => {
        if (state.busy || !state.target) return;
        const target = state.target;
        const distance = bot.entity.position.distanceTo(target.position);
        if (!target.isValid || distance > state.maxDistance || target.health === 0) { stopCombat(bot, state); return; }
        if (distance > state.attackRange) return;
        state.busy = true;
        try {
          await bot.lookAt(target.position.offset(0, target.height * 0.75, 0), true);
          bot.attack(target);
          state.attacks++;
        } finally { state.busy = false; }
      })().catch(() => stopCombat(bot, state));
    }, args.intervalMs ?? 625);
    return structured(factory, { success: true, target: entityName(entity), entityId: entity.id, weapon, attackRange: state.attackRange });
  });

  factory.registerTool('stop-combat', 'Stop the active combat loop and pursuit.', {}, async () => {
    const bot = getBot();
    const state = stateFor(bot);
    const target = state.target ? entityName(state.target) : null;
    const attacks = state.attacks;
    stopCombat(bot, state);
    return structured(factory, { success: true, target, attacks });
  });

  factory.registerTool('combat-status', 'Report the current combat target, range and attack count.', {}, async () => {
    const bot = getBot();
    const state = stateFor(bot);
    return structured(factory, { active: Boolean(state.timer && state.target), target: state.target ? entityName(state.target) : null, entityId: state.target?.id ?? null, attacks: state.attacks, attackRange: state.attackRange });
  });
}
