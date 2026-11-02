import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = require(join(root, 'app.js')).Fit30Core;

const BAD = /NaN|undefined|\[object Object\]|Infinity/;
const female = { sex: 'female', age: 35, heightCm: 165, weightKg: 70, activity: 'light', deficit: 'moderate', diet: 'omnivore' };

function populatedState() {
  const s = core.defaultState();
  const today = core.todayISO();
  s.profile = { ...female, onboarded: true };
  const t = core.calcTargets(female);
  s.targets = { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, waterMl: t.waterMl, steps: 8000, sleepMin: 450, source: 'calculated' };
  s.mission.startDate = core.addDays(today, -9);
  for (let i = 0; i < 10; i++) {
    const d = core.addDays(today, -i);
    s.diary[d] = [core.entryFromFood(core.FOOD_BY_ID.oats, 40, 'breakfast'), core.entryFromFood(core.FOOD_BY_ID['chicken-breast'], 150, 'dinner')];
    s.health[d] = core.normaliseHealth({ weightKg: 70 - i * 0.1, waistCm: 82, steps: 9000, sleepMin: 420, waterMl: 1500 });
  }
  s.workouts[today] = { ...core.buildSession('strength-a', 2), completed: true };
  s.savedMeals.push({ id: 'm-1', name: 'Lunch box', budget: 500, items: [{ foodId: 'lentils', grams: 150 }], createdAt: new Date().toISOString() });
  s.builder.items = [{ foodId: 'tofu', grams: 120 }];
  s.groceries = core.generateGroceries(s.plans, 1, 2, []);
  return core.normaliseState(s);
}

test('Mifflin–St Jeor estimate and deficit', () => {
  assert.equal(core.calcBMR({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }), 10 * 80 + 6.25 * 180 - 5 * 30 + 5);
  assert.equal(core.calcBMR({ sex: 'female', weightKg: 70, heightCm: 165, age: 35 }), 10 * 70 + 6.25 * 165 - 5 * 35 - 161);
  const t = core.calcTargets(female);
  assert.equal(t.ok, true);
  assert.equal(t.maintenance, Math.round((10 * 70 + 6.25 * 165 - 5 * 35 - 161) * 1.375));
  assert.equal(t.requested, Math.round(t.maintenance - 500));
  assert.equal(t.kcal, Math.round(Math.max(1200, Math.min(t.maintenance - 500, t.maintenance))));
  const gentle = core.calcTargets({ ...female, deficit: 'gentle' });
  const ambitious = core.calcTargets({ ...female, deficit: 'ambitious' });
  assert.ok(gentle.kcal > t.kcal && t.kcal > ambitious.kcal);
});

test('calorie floor and maintenance guardrail', () => {
  const small = core.calcTargets({ sex: 'female', age: 70, heightCm: 150, weightKg: 45, activity: 'sedentary', deficit: 'ambitious' });
  assert.equal(small.kcal, 1200);
  assert.equal(small.floorApplied, true);
  assert.equal(small.maintenanceAtFloor, true);
  assert.match(core.floorExplanation(small), /floor/);
  const man = core.calcTargets({ sex: 'male', age: 60, heightCm: 160, weightKg: 55, activity: 'sedentary', deficit: 'ambitious' });
  assert.equal(man.kcal, 1500);
  const normal = core.calcTargets(female);
  assert.ok(normal.kcal <= normal.maintenance);
  assert.equal(core.floorExplanation(normal), '');
});

test('a large male profile stays finite and macros reconcile', () => {
  const t = core.calcTargets({ sex: 'male', age: 25, heightCm: 230, weightKg: 250, activity: 'very', deficit: 'gentle' });
  for (const k of ['bmr', 'maintenance', 'kcal', 'protein', 'carbs', 'fat', 'waterMl']) {
    assert.ok(Number.isFinite(t[k]) && t[k] >= 0, k);
  }
  assert.ok(t.kcal <= t.maintenance);
  const low = core.calcTargets({ sex: 'female', age: 60, heightCm: 150, weightKg: 250, activity: 'sedentary', deficit: 'ambitious' });
  for (const p of [t, low]) {
    assert.ok(p.carbs >= 0 && p.fat >= 0 && p.protein >= 0);
    assert.ok(Math.abs(p.protein * 4 + p.carbs * 4 + p.fat * 9 - p.kcal) <= 8);
  }
  assert.equal(low.proteinCapped, true);
});

test('invalid calculator input is rejected with field errors', () => {
  const r = core.calcTargets({ sex: 'other', age: '16', heightCm: 'tall', weightKg: -5, activity: 'couch' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['activity', 'age', 'heightCm', 'sex', 'weightKg']);
  assert.match(r.errors.age, /18/);
  assert.equal(core.calcTargets(null).ok, false);
  assert.equal(core.validateProfile({ ...female, age: 30.5 }).ok, false);
  const split = core.validateSplit({ breakfast: 30, lunch: 30, dinner: 30, snacks: 20 });
  assert.equal(split.ok, false);
  assert.match(split.errors.total, /100%/);
  assert.equal(core.validateSplit({ breakfast: 25, lunch: 30, dinner: 35, snacks: 10 }).ok, true);
});

test('entry normalisation clamps and drops invalid entries', () => {
  assert.equal(core.normaliseEntry(null), null);
  assert.equal(core.normaliseEntry({ name: 'x', grams: 100 }), null);
  assert.equal(core.normaliseEntry({ name: 'x', grams: -1, per100: { kcal: 100 } }), null);
  assert.equal(core.normaliseEntry({ name: '', grams: 10, per100: { kcal: 100 } }), null);
  const e = core.normaliseEntry({ name: '  Toast  ', grams: '50', meal: 'brunch', per100: { kcal: 5000, protein: 'a', carbs: 40, fat: 2 } });
  assert.equal(e.name, 'Toast');
  assert.equal(e.meal, 'snacks');
  assert.equal(e.per100.kcal, 900);
  assert.equal(e.per100.protein, 0);
  const lib = core.normaliseEntry({ foodId: 'oats', grams: 40, meal: 'breakfast' });
  assert.equal(lib.name, 'Porridge oats');
  assert.equal(lib.per100.kcal, 389);
});

test('entry and day totals are derived from grams and per-100 values', () => {
  const a = core.entryFromFood(core.FOOD_BY_ID.oats, 40, 'breakfast');
  const b = core.entryFromFood(core.FOOD_BY_ID.broccoli, 200, 'dinner');
  const ta = core.entryTotals(a);
  assert.ok(Math.abs(ta.kcal - 155.6) < 0.01);
  const day = core.dayTotals([a, b]);
  assert.ok(Math.abs(day.kcal - (155.6 + 68)) < 0.01);
  assert.ok(Math.abs(day.byMeal.dinner.kcal - 68) < 0.01);
  assert.equal(day.byMeal.lunch.kcal, 0);
  assert.equal(day.vegGrams, 200);
  a.grams = 80;
  assert.ok(Math.abs(core.dayTotals([a]).kcal - 311.2) < 0.01);
  assert.equal(core.dayTotals(undefined).kcal, 0);
});

test('builder totals ignore unknown ids and suggestions stay within budget', () => {
  const t = core.builderTotals([{ foodId: 'oats', grams: 100 }, { foodId: 'unicorn', grams: 50 }, { foodId: 'tofu', grams: 'abc' }], 600);
  assert.equal(t.unknown, 2);
  assert.equal(Math.round(t.kcal), 389);
  assert.equal(t.remaining, 600 - t.kcal);
  for (const diet of ['omnivore', 'vegan', 'vegetarian']) {
    for (const budget of [250, 500, 900]) {
      for (let seed = 0; seed < 6; seed++) {
        const items = core.suggestBalancedMeal(budget, diet, seed);
        const total = core.builderTotals(items, budget);
        assert.ok(total.kcal <= budget && total.kcal > budget * 0.5, `${diet} ${budget} ${seed}: ${total.kcal}`);
        assert.equal(total.unknown, 0);
        if (diet === 'vegan') items.forEach((i) => assert.equal(core.FOOD_BY_ID[i.foodId].dietLevel, 0));
      }
    }
  }
});

test('grocery generation scales deterministically and keeps custom items', () => {
  const plans = core.defaultPlans();
  const one = core.generateGroceries(plans, 2, 1, []);
  const three = core.generateGroceries(plans, 2, 3, []);
  assert.deepEqual(core.generateGroceries(plans, 2, 3, []), three);
  const oats1 = one.items.find((i) => i.foodId === 'oats');
  const oats3 = three.items.find((i) => i.foodId === 'oats');
  assert.ok(oats3.qty >= oats1.qty * 3 - 10 && oats3.qty <= oats1.qty * 3 + 30);
  const custom = { id: 'g-x', foodId: null, name: 'Washing-up liquid', qty: 1, unit: 'bottle', aisle: 'Other', checked: false, custom: true };
  const regen = core.generateGroceries(plans, 1, 2, [...one.items, custom]);
  assert.ok(regen.items.some((i) => i.name === 'Washing-up liquid'));
  assert.equal(regen.week, 1);
  assert.equal(regen.household, 2);
  assert.match(core.groceriesToText(regen), /VEGETABLES/);
});

test('mission day arithmetic before, during and after', () => {
  assert.equal(core.missionInfo('2026-03-01', '2026-02-27').status, 'before');
  const during = core.missionInfo('2026-03-01', '2026-03-10');
  assert.equal(during.status, 'active');
  assert.equal(during.day, 10);
  assert.equal(during.endDate, '2026-03-30');
  assert.equal(core.missionInfo('2026-03-01', '2026-03-30').day, 30);
  const after = core.missionInfo('2026-03-01', '2026-03-31');
  assert.equal(after.status, 'after');
  assert.equal(after.day, 30);
  assert.equal(core.missionInfo('bad', '2026-03-01').status, 'unset');
  assert.equal(core.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(core.diffDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(core.isValidDate('2026-02-30'), false);
});

test('phase mapping and weekly session pattern', () => {
  assert.deepEqual([1, 7, 8, 14, 15, 21, 22, 30].map(core.phaseForDay), [1, 1, 2, 2, 3, 3, 4, 4]);
  for (let w = 0; w < 4; w++) {
    const types = [1, 2, 3, 4, 5, 6, 7].map((d) => core.sessionTypeForDay(w * 7 + d));
    assert.equal(types.filter((t) => t.startsWith('strength')).length, 3);
    assert.equal(types.filter((t) => t === 'aerobic').length, 2);
    assert.equal(types.filter((t) => t === 'rest').length, 2);
  }
  const a = core.buildSession('strength-a', 1).exercises.map((e) => e.id);
  const b = core.buildSession('strength-b', 1).exercises.map((e) => e.id);
  assert.notDeepEqual(a, b);
  assert.equal(core.buildSession('strength-a', 1).exercises[0].sets, 2);
  assert.equal(core.buildSession('strength-a', 3).exercises[0].sets, 3);
  assert.equal(core.buildSession('aerobic', 4).aerobicMin, 35);
});

test('adherence flags reflect the day record', () => {
  const s = core.defaultState();
  s.targets = { ...s.targets, kcal: 1500, protein: 100, steps: 8000 };
  s.mission.startDate = '2026-03-01';
  const d = '2026-03-01';
  const empty = core.adherenceForDay(s, d);
  assert.equal(empty.score, 0);
  s.diary[d] = [core.normaliseEntry({ name: 'Meal', grams: 1000, per100: { kcal: 140, protein: 10 } })];
  s.health[d] = core.normaliseHealth({ steps: 9000 });
  s.workouts[d] = { ...core.buildSession('strength-a', 1), completed: true };
  const full = core.adherenceForDay(s, d);
  assert.deepEqual(full.flags, { food: true, calories: true, protein: true, movement: true, steps: true });
  assert.equal(full.score, 5);
  assert.equal(core.adherenceForDay(s, '2026-03-04').flags.movement, true, 'scheduled rest counts');
  const week = core.sevenDayAdherence(s, '2026-03-07');
  assert.equal(week.days.length, 7);
  assert.ok(week.pct >= 0 && week.pct <= 100);
});

test('chart SVG and accessible text tables', () => {
  const points = [{ date: '2026-03-01', value: 70 }, { date: '2026-03-02', value: null }, { date: '2026-03-03', value: 69.4 }];
  const html = core.lineChart({ id: 'w', title: 'Weight', unit: 'kg', decimals: true, points, avg: core.rollingAverage(points, 7), target: 67 });
  assert.match(html, /<svg[^>]+role="img"/);
  assert.match(html, /<polyline class="chart-line"/);
  assert.match(html, /<div class="visually-hidden"><table>/);
  assert.match(html, /69\.4 kg/);
  assert.doesNotMatch(html, BAD);
  const empty = core.lineChart({ id: 'e', title: 'Waist', unit: 'cm', points: [] });
  assert.match(empty, /No entries yet/);
  assert.doesNotMatch(empty, BAD);
  const bars = core.barChart({ id: 'b', title: 'Steps', unit: 'steps', points: [{ date: '2026-03-01', value: 5000 }, { date: '2026-03-02', value: null }], target: 8000 });
  assert.match(bars, /<rect class="chart-bar"/);
  assert.match(bars, /<line class="chart-target"/);
  assert.doesNotMatch(bars, BAD);
  const blank = core.barChart({ id: 'c', title: 'Sleep', unit: 'hours', points: [{ date: '2026-03-01', value: null }], target: NaN });
  assert.doesNotMatch(blank, BAD);
});

test('hostile import normalisation never produces unsafe values', () => {
  const hostile = {
    version: 'x', profile: { sex: '<script>', age: 1e9, heightCm: Infinity, weightKg: 'NaN', activity: '__proto__', onboarded: true },
    targets: { kcal: -100, protein: {}, steps: 1e12 },
    mission: { startDate: '2026-13-45' },
    diary: { 'not-a-date': [{}], '2026-03-01': [{ name: '<img src=x onerror=alert(1)>', grams: 100, per100: { kcal: 100 } }, 'junk', null], '2026-03-02': 'bad' },
    health: { '2026-03-01': { weightKg: -70, steps: 'many', sleepMin: 99999, notes: { a: 1 } } },
    workouts: { '2026-03-01': { type: 'strength-a', completed: true, symptoms: ['chest-pain', 'made-up'], exercises: new Array(100).fill({ name: 'x', sets: 999 }) } },
    savedMeals: [{ name: 'ok', items: [{ foodId: 'oats', grams: 50 }, { foodId: 'nope', grams: 5 }] }, 7],
    mealSplit: { breakfast: 90, lunch: 90, dinner: 90, snacks: 90 },
    plans: { 1: 'x', 2: [] },
    ui: { theme: 'neon' }
  };
  const s = core.normaliseState(hostile);
  assert.equal(s.profile.onboarded, false);
  assert.equal(s.profile.sex, null);
  assert.equal(s.targets.kcal, 1600);
  assert.equal(s.mission.startDate, null);
  assert.deepEqual(Object.keys(s.diary), ['2026-03-01']);
  assert.equal(s.diary['2026-03-01'].length, 1);
  assert.equal(s.health['2026-03-01'], undefined);
  const w = s.workouts['2026-03-01'];
  assert.equal(w.completed, false);
  assert.equal(w.stopped, true);
  assert.deepEqual(w.symptoms, ['chest-pain']);
  assert.ok(w.exercises.length <= 15 && w.exercises.every((e) => e.sets === 0 || e.sets <= 20));
  assert.equal(s.savedMeals.length, 1);
  assert.equal(s.savedMeals[0].items.length, 1);
  assert.deepEqual(s.mealSplit, { breakfast: 25, lunch: 30, dinner: 35, snacks: 10 });
  assert.equal(s.plans[1].length, 7);
  assert.equal(s.ui.theme, 'system');
  assert.doesNotMatch(JSON.stringify(s), /NaN|Infinity/);
  for (const r of core.ROUTES) assert.doesNotMatch(core.renderView(r, s, core.makeContext()), BAD);
  assert.equal(core.normaliseState('garbage').version, 1);
});

test('import accepts wrapped and bare backups and rejects junk', () => {
  const s = populatedState();
  const wrapped = core.parseImport(JSON.stringify(core.exportPayload(s)));
  assert.equal(wrapped.ok, true);
  assert.equal(Object.keys(wrapped.state.diary).length, 10);
  const bare = core.parseImport(JSON.stringify(s));
  assert.equal(bare.ok, true);
  assert.equal(bare.state.profile.weightKg, 70);
  assert.equal(core.parseImport('{not json').ok, false);
  assert.equal(core.parseImport('[1,2,3]').ok, false);
  assert.equal(core.parseImport('{"hello":"world"}').ok, false);
  assert.equal(core.parseImport('').ok, false);
});

test('progress statistics and weekly session counts come from records', () => {
  const s = populatedState();
  const today = core.todayISO();
  s.workouts[core.addDays(today, -1)] = { ...core.buildSession('strength-b', 2), completed: true, aerobicMin: 10 };
  s.workouts[core.addDays(today, -2)] = { ...core.buildSession('aerobic', 2), stopped: true, aerobicMin: 12 };
  s.workouts[core.addDays(today, -3)] = { ...core.buildSession('strength-a', 2), completed: false };
  const st = core.trainingStats(s.workouts, core.addDays(today, -6), today);
  assert.equal(st.strength, 2);
  assert.equal(st.core, 2);
  assert.equal(st.stopped, 1);
  assert.equal(st.aerobicMin, 22);
  const p = core.progressStats(s, core.addDays(today, -9), today);
  assert.equal(p.daysLogged, 10);
  assert.equal(p.weightChange, 0.9);
  assert.equal(p.waistChange, 0);
  assert.ok(Number.isFinite(p.avgKcal) && Number.isFinite(p.adherencePct));
  const range = core.weekRangeFor(s, today);
  assert.equal(core.diffDays(range.from, range.to), 6);
});

test('every view renders populated state cleanly and every action has a handler', () => {
  const s = populatedState();
  const ctxs = [
    core.makeContext(),
    core.makeContext({ ui: { foodTab: 'usda', usda: { status: 'done', results: [{ name: 'Apple', brand: 'X', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }] } } }),
    core.makeContext({ ui: { foodTab: 'barcode', barcode: { status: 'done', message: 'Found', product: { name: 'Bar', kcal: 400, protein: 10, carbs: 50, fat: 15, image: 'https://evil.example/x.png' } } } }),
    core.makeContext({ ui: { foodTab: 'custom', plannerTab: 'templates' } }),
    core.makeContext({ ui: { plannerTab: 'groceries' } }),
    core.makeContext({ ui: { plannerTab: 'prep' } })
  ];
  for (const ctx of ctxs) {
    for (const r of core.ROUTES) {
      const html = core.renderView(r, s, ctx);
      assert.doesNotMatch(html, BAD, `${r}`);
      assert.ok(html.length > 500);
    }
  }
  assert.doesNotMatch(core.renderView('food', s, ctxs[2]), /evil\.example/);
  assert.match(core.renderView('dashboard', s, ctxs[0]), /Day 10 of 30/);
  const source = readFileSync(join(root, 'app.js'), 'utf8');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const actions = new Set();
  for (const m of (source + html).matchAll(/data-(?:action|live)="([a-z-]+)"/g)) actions.add(m[1]);
  for (const m of source.matchAll(/(?:action|live): '([a-z-]+)'/g)) actions.add(m[1]);
  for (const p of ['food', 'train']) for (const s2 of ['prev', 'next', 'set', 'today']) actions.add(`${p}-date-${s2}`);
  for (const a of actions) assert.ok(source.includes(`case '${a}':`), `missing handler for ${a}`);
  assert.ok(actions.size > 60);
});

test('every view renders the empty state without NaN or undefined', () => {
  const s = core.defaultState();
  for (const r of core.ROUTES) {
    const html = core.renderView(r, s, core.makeContext());
    assert.doesNotMatch(html, BAD, r);
  }
  const dash = core.renderView('dashboard', s, core.makeContext());
  assert.match(dash, /Lose up to <strong>3 kg<\/strong> in 30 days\. Keep the habits\./);
  assert.match(dash, /ambitious upper target/);
  assert.match(dash, /Free · No account required · Local by default, optional Google sync/);
  assert.match(core.renderView('learn', s, core.makeContext()), /eating disorder/);
  const onboarded = core.normaliseState({ ...s, profile: { ...female, onboarded: true } });
  assert.doesNotMatch(core.renderView('progress', onboarded, core.makeContext()), BAD);
  assert.doesNotMatch(core.renderView('dashboard', onboarded, core.makeContext()), BAD);
});

test('user text is escaped everywhere it is rendered', () => {
  const evil = '<img src=x onerror="alert(1)">\'&';
  assert.equal(core.esc(evil), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;');
  assert.equal(core.esc(undefined), '');
  assert.equal(core.esc(NaN), '');
  assert.equal(core.esc({}), '');
  const s = populatedState();
  const today = core.todayISO();
  s.diary[today].push(core.normaliseEntry({ name: evil, brand: evil, grams: 50, meal: 'lunch', per100: { kcal: 100 } }));
  s.savedMeals[0].name = evil;
  s.builder.name = evil;
  s.prep.items = [{ id: 'p-1', text: evil, done: false, custom: true }];
  s.prep.notes = evil;
  s.groceries.items.push({ id: 'g-e', foodId: null, name: evil, qty: 1, unit: '<b>', aisle: 'Other', checked: false, custom: true });
  s.workouts[today].notes = evil;
  s.workouts[today].painNote = evil;
  s.health[today].notes = evil;
  const views = [
    core.renderView('food', s, core.makeContext()),
    core.renderView('planner', s, core.makeContext()),
    core.renderView('planner', s, core.makeContext({ ui: { plannerTab: 'groceries' } })),
    core.renderView('planner', s, core.makeContext({ ui: { plannerTab: 'prep' } })),
    core.renderView('training', s, core.makeContext()),
    core.renderView('progress', s, core.makeContext())
  ];
  for (const v of views) {
    assert.doesNotMatch(v, /<img src=x/);
    assert.doesNotMatch(v, /<b>/);
  }
  assert.match(views[0], /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test('barcode validation checks length, digits and GS1 check digit', () => {
  assert.deepEqual(core.validateBarcode('3017620422003'), { ok: true, code: '3017620422003' });
  assert.equal(core.validateBarcode('96385074').ok, true);
  assert.equal(core.validateBarcode('036000291452').ok, true);
  assert.equal(core.validateBarcode('10036000291459').ok, true);
  assert.equal(core.validateBarcode('3017 6204 2200 3').ok, true);
  assert.equal(core.validateBarcode('3017620422004').ok, false);
  assert.equal(core.validateBarcode('12345').ok, false);
  assert.equal(core.validateBarcode('abc').ok, false);
  assert.equal(core.validateBarcode('').ok, false);
  assert.equal(core.validateBarcode(null).ok, false);
  assert.equal(core.safeImageUrl('https://images.openfoodfacts.org/a.jpg'), 'https://images.openfoodfacts.org/a.jpg');
  assert.equal(core.safeImageUrl('https://wger.de/media/x.png'), 'https://wger.de/media/x.png');
  assert.equal(core.safeImageUrl('https://openfoodfacts.org.evil.com/a.jpg'), '');
  assert.equal(core.safeImageUrl('javascript:alert(1)'), '');
});

test('health and custom food inputs reject negatives, text and extremes', () => {
  const ok = core.validateHealth({ weightKg: '72.4', waistCm: '84', steps: '9500', sleepHours: '7.5', waterMl: '2000', hunger: '3', energy: '4', notes: 'fine' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.sleepMin, 450);
  assert.equal(ok.value.weightKg, 72.4);
  const bad = core.validateHealth({ weightKg: '-70', waistCm: 'wide', steps: '12.5', sleepHours: '30', waterMl: 'NaN', hunger: '9', energy: '0' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['energy', 'hunger', 'sleepHours', 'steps', 'waistCm', 'waterMl', 'weightKg']);
  assert.equal(core.validateHealth({ weightKg: '1e9' }).ok, false);
  assert.equal(core.validateHealth({}).ok, true);
  const food = core.validateCustomFood({ name: 'Flapjack', kcal: '450', protein: '6', carbs: '60', fat: '20', grams: '60' });
  assert.equal(food.ok, true);
  const missing = core.validateCustomFood({ name: '', kcal: '', protein: '1', carbs: '1', fat: '1', grams: '50' });
  assert.ok(missing.errors.name && missing.errors.kcal);
  assert.ok(core.validateCustomFood({ name: 'x', kcal: '900', protein: '1', carbs: '1', fat: '1', grams: '50' }).errors.kcal);
  assert.ok(core.validateCustomFood({ name: 'x', kcal: '500', protein: '60', carbs: '60', fat: '10', grams: '50' }).errors.fat);
  assert.ok(core.validateCustomFood({ name: 'x', kcal: '100', protein: '5', carbs: '15', fat: '2', grams: '-3' }).errors.grams);
});
