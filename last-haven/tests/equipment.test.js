import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, give } from './helpers.js';

test('equipment: 裝備/卸下影響衍生數值，武器攻速取代基礎攻速', () => {
  const g = makeGame();
  const P = g.systems.player;
  const s0 = P.getStats();
  assert.equal(s0.attack, 10 + 4); // base 10 + 木棍 4
  assert.equal(s0.attackSpeed, 1.0);
  const r = give(g, 'inventory', 'bone_dagger', 1);
  const eq = g.intent('equip', { uid: r.inst.uid });
  assert.equal(eq.ok, true);
  const s1 = P.getStats();
  assert.equal(s1.attack, 10 + Math.round(8 * 1.15)); // bone_dagger 為精良品質
  assert.equal(s1.attackSpeed, 1.6);
  assert.ok(s1.critChance > s0.critChance);
  // 舊武器回到來源容器
  assert.ok(g.systems.inventory.count('inventory', 'wooden_club') === 1);
  const un = g.intent('unequip', { slot: 'weapon' });
  assert.equal(un.ok, true);
  assert.equal(P.getStats().attack, 10);
  assert.equal(P.getStats().attackSpeed, 1.0);
});

test('equipment: 品質倍率縮放攻防與負重', () => {
  const g = makeGame();
  const I = g.systems.item;
  const common = I.createInstance('iron_sword', 1, 'common');
  const legend = I.createInstance('iron_sword', 1, 'legendary');
  assert.equal(I.getStats(common).attack, 12);
  assert.equal(I.getStats(legend).attack, 24);
  assert.equal(I.getStats(legend).attackSpeed, 1.0); // 攻速不縮放
  const pack = I.createInstance('backpack', 1, 'rare');
  g.state.player.equipment.accessory = pack;
  g.modifiers.invalidate();
  assert.equal(g.systems.inventory.carryCapacity(), 40 + Math.round(15 * 1.35));
});

test('equipment: 非裝備不能裝備；戰鬥中不能換裝', () => {
  const g = makeGame();
  const r = give(g, 'inventory', 'wood', 1);
  assert.equal(g.intent('equip', { uid: r.inst.uid }).reason, 'notEquipment');
  g.state.combat = { origin: 'exploration', enemies: [{ uid: 'e1', defId: 'x', hp: 1 }], loot: [] };
  const sw = give(g, 'inventory', 'machete', 1);
  assert.equal(g.intent('equip', { uid: sw.inst.uid }).reason, 'inCombat');
  g.state.combat = null;
});

test('equipment: 抗性彙總', () => {
  const g = makeGame();
  g.state.player.equipment.head = g.systems.item.createInstance('gas_mask', 1);
  const s = g.systems.player.getStats();
  assert.equal(s.resist.poison, 0.5);
});
