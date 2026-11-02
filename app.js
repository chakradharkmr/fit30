/* Fit30 Reset — local-first 30-day diet and movement planner.
   Pure logic and view functions live in Fit30Core so they can be tested in Node.
   Nothing here touches document or window until boot() runs in a browser. */
(function (root, factory) {
  'use strict';
  var core = factory();
  core.Fit30Core = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.Fit30Core = core;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', core.boot);
    else core.boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */

  var STORAGE_KEY = 'fit30.reset.v1';
  var APP_ID = 'fit30-reset';
  var SCHEMA = 1;
  var MISSION_DAYS = 30;
  var MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
  var MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
  var ROUTES = ['dashboard', 'food', 'planner', 'training', 'progress', 'learn', 'settings'];
  var ROUTE_TITLES = {
    dashboard: 'Today', food: 'Food diary', planner: 'Planner', training: 'Training',
    progress: 'Progress', learn: 'Learn', settings: 'Settings'
  };

  var ACTIVITY = {
    sedentary: { factor: 1.2, label: 'Sedentary — mostly sitting, little planned exercise' },
    light: { factor: 1.375, label: 'Light — on your feet some of the day or 1–3 sessions a week' },
    moderate: { factor: 1.55, label: 'Moderate — active job or 3–5 sessions a week' },
    very: { factor: 1.725, label: 'Very active — physical job or hard training most days' }
  };
  var DEFICITS = {
    gentle: { kcal: 300, label: 'Gentle — about 300 kcal below maintenance' },
    moderate: { kcal: 500, label: 'Moderate — about 500 kcal below maintenance' },
    ambitious: { kcal: 700, label: 'Ambitious — about 700 kcal below maintenance' }
  };
  var FLOORS = { female: 1200, male: 1500 };
  var DIETS = {
    omnivore: { level: 3, label: 'Omnivore' },
    pescatarian: { level: 2, label: 'Pescatarian' },
    vegetarian: { level: 1, label: 'Vegetarian' },
    vegan: { level: 0, label: 'Vegan' }
  };
  var DEFAULT_SPLIT = { breakfast: 25, lunch: 30, dinner: 35, snacks: 10 };
  var THEMES = ['system', 'light', 'dark'];

  var CATEGORIES = {
    plant: { label: 'Plant proteins', aisle: 'Pulses and plant proteins', group: 'protein' },
    dairy: { label: 'Dairy and eggs', aisle: 'Dairy and eggs', group: 'protein' },
    meat: { label: 'Meat and fish', aisle: 'Meat and fish', group: 'protein' },
    carbs: { label: 'Carbohydrates', aisle: 'Bakery, grains and cereals', group: 'carbs' },
    veg: { label: 'Vegetables', aisle: 'Vegetables', group: 'veg' },
    fruit: { label: 'Fruit', aisle: 'Fruit', group: 'fruit' },
    fats: { label: 'Fats', aisle: 'Oils, nuts and seeds', group: 'fats' }
  };
  var AISLE_ORDER = ['Vegetables', 'Fruit', 'Meat and fish', 'Dairy and eggs', 'Pulses and plant proteins',
    'Bakery, grains and cereals', 'Oils, nuts and seeds', 'Other'];

  /* [id, name, category, kcal, protein, carbs, fat, default portion, unit, diet level]
     diet level: 0 vegan, 1 vegetarian, 2 pescatarian, 3 omnivore. Values per 100 g or 100 ml. */
  var FOOD_ROWS = [
    ['lentils', 'Lentils, cooked', 'plant', 116, 9, 20, 0.4, 150, 'g', 0],
    ['chickpeas', 'Chickpeas, cooked', 'plant', 164, 8.9, 27.4, 2.6, 120, 'g', 0],
    ['black-beans', 'Black beans, cooked', 'plant', 132, 8.9, 23.7, 0.5, 120, 'g', 0],
    ['kidney-beans', 'Kidney beans, cooked', 'plant', 127, 8.7, 22.8, 0.5, 120, 'g', 0],
    ['split-peas', 'Split peas, cooked', 'plant', 118, 8.3, 21.1, 0.4, 150, 'g', 0],
    ['tofu', 'Tofu, firm', 'plant', 144, 15.7, 3.9, 8.7, 120, 'g', 0],
    ['tempeh', 'Tempeh', 'plant', 192, 20.3, 7.6, 10.8, 100, 'g', 0],
    ['edamame', 'Edamame beans', 'plant', 121, 11.9, 8.9, 5.2, 100, 'g', 0],
    ['baked-beans', 'Baked beans, reduced sugar', 'plant', 73, 4.7, 12.5, 0.4, 200, 'g', 0],
    ['hummus', 'Hummus', 'plant', 166, 7.9, 14.3, 9.6, 50, 'g', 0],
    ['soya-mince', 'Soya mince, dry', 'plant', 327, 51, 22, 1.2, 50, 'g', 0],
    ['soya-milk', 'Soya drink, unsweetened', 'plant', 33, 3.3, 0.6, 1.8, 250, 'ml', 0],
    ['eggs', 'Eggs', 'dairy', 143, 12.6, 0.7, 9.5, 120, 'g', 1],
    ['greek-yoghurt-0', 'Greek-style yoghurt, 0% fat', 'dairy', 59, 10.3, 3.6, 0.4, 150, 'g', 1],
    ['greek-yoghurt', 'Greek-style yoghurt, whole', 'dairy', 97, 9, 4, 5, 150, 'g', 1],
    ['skyr', 'Skyr, plain', 'dairy', 63, 11, 4, 0.2, 150, 'g', 1],
    ['quark', 'Quark, plain', 'dairy', 67, 12, 4, 0.2, 150, 'g', 1],
    ['cottage-cheese', 'Cottage cheese', 'dairy', 98, 11, 3.4, 4.3, 100, 'g', 1],
    ['semi-milk', 'Semi-skimmed milk', 'dairy', 47, 3.5, 4.8, 1.7, 250, 'ml', 1],
    ['skimmed-milk', 'Skimmed milk', 'dairy', 35, 3.4, 5, 0.1, 250, 'ml', 1],
    ['kefir', 'Kefir, plain', 'dairy', 52, 3.5, 4.5, 2, 200, 'ml', 1],
    ['cheddar', 'Cheddar cheese', 'dairy', 403, 25, 1.3, 33, 30, 'g', 1],
    ['feta', 'Feta cheese', 'dairy', 264, 14, 4, 21, 30, 'g', 1],
    ['mozzarella-light', 'Mozzarella, light', 'dairy', 165, 18, 1, 10, 60, 'g', 1],
    ['parmesan', 'Parmesan-style hard cheese', 'dairy', 392, 35.8, 3.2, 25.8, 15, 'g', 1],
    ['chicken-breast', 'Chicken breast, cooked', 'meat', 165, 31, 0, 3.6, 120, 'g', 3],
    ['chicken-thigh', 'Chicken thigh, skinless, cooked', 'meat', 177, 24, 0, 9, 120, 'g', 3],
    ['turkey-mince', 'Turkey breast mince, raw', 'meat', 115, 23, 0, 2.5, 125, 'g', 3],
    ['beef-mince-5', 'Beef mince 5% fat, raw', 'meat', 129, 21, 0, 5, 125, 'g', 3],
    ['pork-loin', 'Pork loin, lean, cooked', 'meat', 143, 26, 0, 4.2, 120, 'g', 3],
    ['ham', 'Ham, sliced', 'meat', 107, 18, 1.5, 3.2, 40, 'g', 3],
    ['salmon', 'Salmon fillet, cooked', 'meat', 208, 20, 0, 13, 120, 'g', 2],
    ['cod', 'Cod fillet, cooked', 'meat', 82, 18, 0, 0.7, 140, 'g', 2],
    ['tuna-tin', 'Tuna in spring water, drained', 'meat', 116, 26, 0, 1, 100, 'g', 2],
    ['prawns', 'Prawns, cooked', 'meat', 99, 24, 0.2, 0.3, 100, 'g', 2],
    ['mackerel', 'Mackerel fillet, cooked', 'meat', 205, 19, 0, 13.9, 100, 'g', 2],
    ['sardines', 'Sardines in tomato sauce', 'meat', 162, 17, 1.4, 9.9, 90, 'g', 2],
    ['oats', 'Porridge oats', 'carbs', 389, 16.9, 66.3, 6.9, 40, 'g', 0],
    ['muesli', 'Muesli, no added sugar', 'carbs', 362, 10, 66, 6, 45, 'g', 0],
    ['brown-rice', 'Brown rice, cooked', 'carbs', 123, 2.7, 25.6, 1, 150, 'g', 0],
    ['white-rice', 'White rice, cooked', 'carbs', 130, 2.7, 28, 0.3, 150, 'g', 0],
    ['wholewheat-pasta', 'Wholewheat pasta, cooked', 'carbs', 149, 5.8, 30, 1.1, 160, 'g', 0],
    ['pasta', 'Pasta, cooked', 'carbs', 158, 5.8, 31, 0.9, 160, 'g', 0],
    ['wholemeal-bread', 'Wholemeal bread', 'carbs', 247, 13, 41, 3.4, 40, 'g', 0],
    ['sourdough', 'Sourdough bread', 'carbs', 260, 9, 51, 2, 50, 'g', 0],
    ['wrap', 'Wholemeal tortilla wrap', 'carbs', 300, 9, 50, 7, 60, 'g', 0],
    ['rye-crispbread', 'Rye crispbread', 'carbs', 334, 9, 66, 1.7, 20, 'g', 0],
    ['potatoes', 'Potatoes, boiled', 'carbs', 87, 1.9, 20, 0.1, 200, 'g', 0],
    ['sweet-potato', 'Sweet potato, baked', 'carbs', 90, 2, 20.7, 0.2, 200, 'g', 0],
    ['quinoa', 'Quinoa, cooked', 'carbs', 120, 4.4, 21.3, 1.9, 150, 'g', 0],
    ['couscous', 'Couscous, cooked', 'carbs', 112, 3.8, 23.2, 0.2, 150, 'g', 0],
    ['bulgur', 'Bulgur wheat, cooked', 'carbs', 83, 3.1, 18.6, 0.2, 150, 'g', 0],
    ['barley', 'Pearl barley, cooked', 'carbs', 123, 2.3, 28.2, 0.4, 150, 'g', 0],
    ['broccoli', 'Broccoli', 'veg', 34, 2.8, 7, 0.4, 80, 'g', 0],
    ['spinach', 'Spinach', 'veg', 23, 2.9, 3.6, 0.4, 80, 'g', 0],
    ['carrots', 'Carrots', 'veg', 41, 0.9, 9.6, 0.2, 80, 'g', 0],
    ['tomatoes', 'Tomatoes', 'veg', 18, 0.9, 3.9, 0.2, 80, 'g', 0],
    ['chopped-tomatoes', 'Chopped tomatoes, tinned', 'veg', 21, 1.1, 3.8, 0.1, 200, 'g', 0],
    ['cucumber', 'Cucumber', 'veg', 15, 0.7, 3.6, 0.1, 80, 'g', 0],
    ['peppers', 'Peppers', 'veg', 31, 1, 6, 0.3, 80, 'g', 0],
    ['onion', 'Onion', 'veg', 40, 1.1, 9.3, 0.1, 80, 'g', 0],
    ['courgette', 'Courgette', 'veg', 17, 1.2, 3.1, 0.3, 80, 'g', 0],
    ['mushrooms', 'Mushrooms', 'veg', 22, 3.1, 3.3, 0.3, 80, 'g', 0],
    ['green-beans', 'Green beans', 'veg', 31, 1.8, 7, 0.2, 80, 'g', 0],
    ['peas', 'Garden peas, frozen', 'veg', 81, 5.4, 14.5, 0.4, 80, 'g', 0],
    ['cauliflower', 'Cauliflower', 'veg', 25, 1.9, 5, 0.3, 80, 'g', 0],
    ['kale', 'Kale', 'veg', 49, 4.3, 8.8, 0.9, 80, 'g', 0],
    ['salad-leaves', 'Mixed salad leaves', 'veg', 15, 1.4, 2.9, 0.2, 50, 'g', 0],
    ['cabbage', 'Cabbage', 'veg', 25, 1.3, 5.8, 0.1, 80, 'g', 0],
    ['aubergine', 'Aubergine', 'veg', 25, 1, 6, 0.2, 80, 'g', 0],
    ['sweetcorn', 'Sweetcorn', 'veg', 86, 3.3, 19, 1.4, 80, 'g', 0],
    ['beetroot', 'Beetroot, cooked', 'veg', 43, 1.6, 9.6, 0.2, 80, 'g', 0],
    ['butternut', 'Butternut squash', 'veg', 45, 1, 11.7, 0.1, 100, 'g', 0],
    ['apple', 'Apple', 'fruit', 52, 0.3, 13.8, 0.2, 120, 'g', 0],
    ['banana', 'Banana', 'fruit', 89, 1.1, 22.8, 0.3, 110, 'g', 0],
    ['orange', 'Orange', 'fruit', 47, 0.9, 11.8, 0.1, 130, 'g', 0],
    ['mixed-berries', 'Mixed berries, frozen', 'fruit', 50, 0.9, 12, 0.3, 80, 'g', 0],
    ['strawberries', 'Strawberries', 'fruit', 32, 0.7, 7.7, 0.3, 80, 'g', 0],
    ['blueberries', 'Blueberries', 'fruit', 57, 0.7, 14.5, 0.3, 80, 'g', 0],
    ['raspberries', 'Raspberries', 'fruit', 52, 1.2, 11.9, 0.7, 80, 'g', 0],
    ['pear', 'Pear', 'fruit', 57, 0.4, 15.2, 0.1, 150, 'g', 0],
    ['grapes', 'Grapes', 'fruit', 69, 0.7, 18.1, 0.2, 80, 'g', 0],
    ['kiwi', 'Kiwi fruit', 'fruit', 61, 1.1, 14.7, 0.5, 75, 'g', 0],
    ['mango', 'Mango', 'fruit', 60, 0.8, 15, 0.4, 100, 'g', 0],
    ['raisins', 'Raisins', 'fruit', 299, 3.1, 79.2, 0.5, 25, 'g', 0],
    ['olive-oil', 'Olive oil', 'fats', 884, 0, 0, 100, 10, 'g', 0],
    ['rapeseed-oil', 'Rapeseed oil', 'fats', 884, 0, 0, 100, 10, 'g', 0],
    ['butter', 'Butter', 'fats', 717, 0.9, 0.1, 81, 10, 'g', 1],
    ['peanut-butter', 'Peanut butter', 'fats', 588, 25, 20, 50, 15, 'g', 0],
    ['almonds', 'Almonds', 'fats', 579, 21, 22, 50, 25, 'g', 0],
    ['walnuts', 'Walnuts', 'fats', 654, 15, 14, 65, 25, 'g', 0],
    ['cashews', 'Cashew nuts', 'fats', 553, 18, 30, 44, 25, 'g', 0],
    ['avocado', 'Avocado', 'fats', 160, 2, 8.5, 14.7, 70, 'g', 0],
    ['chia', 'Chia seeds', 'fats', 486, 17, 42, 31, 15, 'g', 0],
    ['mixed-seeds', 'Mixed seeds', 'fats', 560, 24, 15, 45, 15, 'g', 0],
    ['flaxseed', 'Ground flaxseed', 'fats', 534, 18, 29, 42, 10, 'g', 0],
    ['tahini', 'Tahini', 'fats', 595, 17, 21, 54, 15, 'g', 0],
    ['dark-chocolate', 'Dark chocolate, 70%', 'fats', 598, 7.8, 46, 43, 20, 'g', 0]
  ];

  var FOODS = FOOD_ROWS.map(function (r) {
    return {
      id: r[0], name: r[1], category: r[2], kcal: r[3], protein: r[4], carbs: r[5], fat: r[6],
      portion: r[7], unit: r[8], dietLevel: r[9]
    };
  });
  var FOOD_BY_ID = {};
  FOODS.forEach(function (f) { FOOD_BY_ID[f.id] = f; });

  /* ------------------------------------------------------------------ */
  /* Weekly meal templates                                               */
  /* ------------------------------------------------------------------ */

  var TEMPLATE_META = {
    1: { name: 'Foundation', range: '1,300–1,700 kcal', notes: 'Simple, repeatable meals. Batch-cook lentils and rice on day 1 and day 4; keep yoghurt, berries and eggs stocked.' },
    2: { name: 'High-volume', range: '1,300–1,750 kcal', notes: 'Large vegetable portions for fullness. Roast two trays of vegetables twice this week and keep a salad box ready.' },
    3: { name: 'Performance', range: '1,450–1,900 kcal', notes: 'Slightly more carbohydrate around strength days. Cook a pot of grains and portion proteins in advance.' },
    4: { name: 'Consolidation', range: '1,350–1,800 kcal', notes: 'Your favourite meals from weeks 1–3, rotated. Practise the habits you want to keep after day 30.' }
  };

  function m() {
    var items = [];
    for (var i = 0; i < arguments.length; i += 2) items.push({ foodId: arguments[i], grams: arguments[i + 1] });
    return items;
  }
  var TEMPLATE_OPTIONS = {
    1: {
      breakfast: [m('oats', 40, 'semi-milk', 200, 'mixed-berries', 80), m('greek-yoghurt-0', 170, 'mixed-berries', 80, 'oats', 25), m('eggs', 120, 'wholemeal-bread', 40, 'tomatoes', 80)],
      lunch: [m('lentils', 150, 'brown-rice', 120, 'spinach', 80, 'olive-oil', 5), m('wholemeal-bread', 80, 'tuna-tin', 100, 'salad-leaves', 50, 'cucumber', 80), m('chickpeas', 120, 'couscous', 120, 'peppers', 80, 'feta', 30)],
      dinner: [m('chicken-breast', 120, 'potatoes', 200, 'broccoli', 120, 'olive-oil', 5), m('tofu', 150, 'brown-rice', 150, 'green-beans', 100, 'olive-oil', 5), m('salmon', 110, 'sweet-potato', 180, 'spinach', 80)],
      snacks: [m('apple', 120, 'almonds', 15), m('skyr', 150), m('banana', 110)]
    },
    2: {
      breakfast: [m('skyr', 150, 'strawberries', 120, 'oats', 25), m('eggs', 120, 'spinach', 80, 'mushrooms', 100, 'rye-crispbread', 20), m('oats', 35, 'skimmed-milk', 200, 'raspberries', 100)],
      lunch: [m('salad-leaves', 80, 'chicken-breast', 100, 'quinoa', 100, 'tomatoes', 120, 'cucumber', 100), m('split-peas', 150, 'carrots', 120, 'onion', 80, 'wholemeal-bread', 40), m('prawns', 100, 'bulgur', 120, 'courgette', 120, 'peppers', 100)],
      dinner: [m('cod', 150, 'potatoes', 180, 'peas', 80, 'green-beans', 100), m('turkey-mince', 125, 'chopped-tomatoes', 200, 'wholewheat-pasta', 120, 'courgette', 100), m('black-beans', 150, 'peppers', 120, 'cauliflower', 150, 'brown-rice', 100)],
      snacks: [m('carrots', 100, 'hummus', 40), m('orange', 130, 'cottage-cheese', 100), m('kiwi', 150)]
    },
    3: {
      breakfast: [m('oats', 50, 'semi-milk', 250, 'banana', 110, 'peanut-butter', 10), m('greek-yoghurt', 170, 'muesli', 45, 'blueberries', 80), m('eggs', 120, 'sourdough', 60, 'avocado', 50)],
      lunch: [m('chicken-breast', 120, 'white-rice', 180, 'broccoli', 100, 'sweetcorn', 60), m('tempeh', 100, 'quinoa', 150, 'kale', 80, 'tahini', 10), m('wrap', 60, 'tuna-tin', 100, 'salad-leaves', 40, 'sweetcorn', 50, 'greek-yoghurt-0', 50)],
      dinner: [m('beef-mince-5', 125, 'wholewheat-pasta', 160, 'chopped-tomatoes', 200, 'onion', 60), m('salmon', 120, 'potatoes', 220, 'green-beans', 100), m('chickpeas', 150, 'couscous', 150, 'aubergine', 120, 'olive-oil', 10)],
      snacks: [m('skyr', 150, 'raspberries', 80), m('banana', 110, 'peanut-butter', 15), m('apple', 120, 'cheddar', 25)]
    },
    4: {
      breakfast: [m('oats', 40, 'soya-milk', 200, 'blueberries', 80, 'chia', 10), m('quark', 150, 'pear', 150, 'mixed-seeds', 10), m('eggs', 120, 'wholemeal-bread', 40, 'spinach', 60)],
      lunch: [m('lentils', 150, 'barley', 120, 'beetroot', 80, 'feta', 25), m('mackerel', 80, 'potatoes', 180, 'salad-leaves', 60, 'cucumber', 80), m('edamame', 100, 'brown-rice', 130, 'carrots', 80, 'cabbage', 80)],
      dinner: [m('chicken-thigh', 120, 'sweet-potato', 180, 'kale', 80), m('tofu', 150, 'white-rice', 150, 'peppers', 120, 'mushrooms', 80, 'rapeseed-oil', 5), m('pork-loin', 120, 'butternut', 180, 'green-beans', 100)],
      snacks: [m('greek-yoghurt-0', 150, 'grapes', 80), m('walnuts', 15, 'orange', 130), m('mango', 100, 'kefir', 150)]
    }
  };

  function buildTemplateWeek(week) {
    var opts = TEMPLATE_OPTIONS[week];
    var days = [];
    for (var d = 0; d < 7; d++) {
      var day = {};
      MEALS.forEach(function (meal, mi) {
        var list = opts[meal];
        day[meal] = list[(d + mi) % list.length].map(function (it) { return { foodId: it.foodId, grams: it.grams }; });
      });
      days.push(day);
    }
    return days;
  }
  function defaultPlans() {
    return { 1: buildTemplateWeek(1), 2: buildTemplateWeek(2), 3: buildTemplateWeek(3), 4: buildTemplateWeek(4) };
  }

  var PREP_TASKS = {
    1: ['Check tomorrow\u2019s planned meals', 'Portion breakfast oats or yoghurt', 'Pack lunch into a container', 'Fill a water bottle', 'Lay out training clothes', 'Set a consistent bedtime'],
    2: ['Wash and chop vegetables for tomorrow', 'Pack a vegetable-heavy lunch', 'Prepare a protein snack', 'Fill a water bottle', 'Lay out training clothes', 'Screens off 30 minutes before bed'],
    3: ['Check whether tomorrow is a strength day', 'Cook or portion grains', 'Prepare a post-training meal', 'Fill a water bottle', 'Charge headphones or tracker', 'Set a consistent bedtime'],
    4: ['Plan tomorrow from your favourite meals', 'Pack lunch and a snack', 'Note one habit to keep after day 30', 'Fill a water bottle', 'Lay out training clothes', 'Set a consistent bedtime']
  };

  /* ------------------------------------------------------------------ */
  /* Training plan                                                       */
  /* ------------------------------------------------------------------ */

  var EXERCISES = {
    'goblet-squat': { name: 'Goblet squat', kind: 'reps', cues: ['Hold a weight at chest height', 'Sit between your hips, chest tall', 'Drive through the whole foot'], easier: 'Squat to a chair', harder: 'Pause at the bottom for two seconds' },
    'push-up': { name: 'Push-up (incline as needed)', kind: 'reps', cues: ['Hands under shoulders', 'Body in one straight line', 'Lower under control'], easier: 'Hands on a worktop or wall', harder: 'Lower the incline' },
    'db-row': { name: 'One-arm dumbbell row', kind: 'reps', cues: ['Support yourself on a bench or chair', 'Pull the elbow towards the hip', 'Keep shoulders level'], easier: 'Lighter weight or band row', harder: 'Three-second lowering' },
    'rdl': { name: 'Romanian deadlift', kind: 'reps', cues: ['Soft knees, push hips back', 'Weights close to the legs', 'Stop when the hamstrings tighten'], easier: 'Hip hinge with a broom handle', harder: 'Single-leg, supported' },
    'farmer-carry': { name: 'Farmer\u2019s carry', kind: 'time', cues: ['Stand tall', 'Short, steady steps', 'Grip firmly, shoulders down'], easier: 'Lighter weights', harder: 'Longer distance' },
    'split-squat': { name: 'Split squat', kind: 'reps', cues: ['Long stance, both feet forward', 'Lower the back knee straight down', 'Hold support if needed'], easier: 'Shorter range', harder: 'Hold dumbbells' },
    'overhead-press': { name: 'Dumbbell overhead press', kind: 'reps', cues: ['Ribs down, glutes tight', 'Press up and slightly back', 'Lower to shoulder height'], easier: 'Seated, lighter weight', harder: 'Standing, slower lowering' },
    'glute-bridge': { name: 'Glute bridge', kind: 'reps', cues: ['Feet flat, hip-width', 'Squeeze glutes to lift', 'Pause at the top'], easier: 'Smaller range', harder: 'Single-leg bridge' },
    'band-pulldown': { name: 'Band pull-down or lat pull-down', kind: 'reps', cues: ['Pull elbows down to the ribs', 'Keep the neck long', 'Control the return'], easier: 'Lighter band', harder: 'Heavier band or machine' },
    'step-up': { name: 'Step-up', kind: 'reps', cues: ['Whole foot on the step', 'Push through the top leg', 'Step down with control'], easier: 'Lower step', harder: 'Hold dumbbells' },
    'dead-bug': { name: 'Dead bug', kind: 'reps', cues: ['Lower back gently pressed down', 'Reach opposite arm and leg', 'Breathe out as you reach'], easier: 'Move legs only', harder: 'Slower tempo' },
    'side-plank': { name: 'Side plank', kind: 'time', cues: ['Elbow under shoulder', 'Hips lifted in line', 'Breathe steadily'], easier: 'From the knees', harder: 'Top leg raised' },
    'bird-dog': { name: 'Bird dog', kind: 'reps', cues: ['Hands under shoulders, knees under hips', 'Reach long, not high', 'Keep hips level'], easier: 'Arms only or legs only', harder: 'Pause for three seconds' },
    'plank': { name: 'Front plank', kind: 'time', cues: ['Elbows under shoulders', 'Squeeze glutes', 'Do not hold your breath'], easier: 'From the knees or incline', harder: 'Longer hold' },
    'chair-squat': { name: 'Squat to chair', kind: 'reps', cues: ['Sit back to touch the chair', 'Stand tall'], easier: 'Use hands', harder: 'Slower lowering' },
    'march': { name: 'Brisk march on the spot', kind: 'time', cues: ['Lift knees, swing arms', 'Breathe comfortably'], easier: 'Slower pace', harder: 'Higher knees' }
  };

  var SESSION_EXERCISES = {
    'strength-a': ['goblet-squat', 'push-up', 'db-row', 'rdl', 'farmer-carry'],
    'strength-b': ['split-squat', 'overhead-press', 'glute-bridge', 'band-pulldown', 'step-up'],
    core: ['dead-bug', 'side-plank', 'bird-dog', 'plank']
  };

  var PHASES = {
    1: { name: 'Foundation', days: '1–7', sets: 2, reps: 10, holdSec: 20, aerobicMin: 20, intensity: 'Easy to moderate. Learn the movements; finish feeling you could do more.' },
    2: { name: 'Build', days: '8–14', sets: 3, reps: 10, holdSec: 25, aerobicMin: 25, intensity: 'Moderate. Add a set; keep two or three repetitions in reserve.' },
    3: { name: 'Progress', days: '15–21', sets: 3, reps: 12, holdSec: 30, aerobicMin: 30, intensity: 'Moderate to hard. Add load or repetitions when the last set feels steady.' },
    4: { name: 'Consolidate', days: '22–30', sets: 3, reps: 12, holdSec: 35, aerobicMin: 35, intensity: 'Keep quality high. Repeat your best sessions and plan what continues after day 30.' }
  };

  var WARNING_SYMPTOMS = {
    'chest-pain': 'Chest pain, pressure or tightness',
    faint: 'Faintness or dizziness',
    breathless: 'Severe or unusual breathlessness',
    neuro: 'Numbness, weakness, or changes in vision or speech',
    sharp: 'Sharp, sudden or radiating pain'
  };
  var WORKOUT_TYPES = ['strength-a', 'strength-b', 'aerobic', 'rest', 'minimum'];
  var WORKOUT_TITLES = {
    'strength-a': 'Strength A + core', 'strength-b': 'Strength B + core', aerobic: 'Aerobic session',
    rest: 'Rest and mobility', minimum: '12-minute minimum session'
  };

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  function esc(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value !== 'string') return '';
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && /^-?\d*(\.\d+)?$|^-?\d+\.?$/.test(v.trim())) return Number(v.trim());
    return NaN;
  }
  function clampNum(v, min, max, fallback) {
    var n = toNumber(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function inRange(v, min, max) {
    var n = toNumber(v);
    return Number.isFinite(n) && n >= min && n <= max;
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function fmtInt(n) {
    if (!Number.isFinite(n)) n = 0;
    return Math.round(n).toLocaleString('en-GB');
  }
  function fmt1(n) {
    if (!Number.isFinite(n)) n = 0;
    return (Math.round(n * 10) / 10).toLocaleString('en-GB', { maximumFractionDigits: 1 });
  }
  function cleanText(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 200);
  }
  function uid(prefix) {
    var rand = '';
    try {
      var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
      if (c && c.getRandomValues) {
        var a = new Uint32Array(2); c.getRandomValues(a); rand = a[0].toString(36) + a[1].toString(36);
      }
    } catch (e) { rand = ''; }
    if (!rand) rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + rand.slice(0, 10);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), mo = +s.slice(5, 7), d = +s.slice(8, 10);
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }
  function todayISO(now) {
    var d = now instanceof Date && !isNaN(now) ? now : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dateToUTC(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function addDays(s, n) {
    if (!isValidDate(s)) return s;
    var d = new Date(dateToUTC(s) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function diffDays(a, b) {
    if (!isValidDate(a) || !isValidDate(b)) return NaN;
    return Math.round((dateToUTC(b) - dateToUTC(a)) / 86400000);
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function fmtDate(s, withYear) {
    if (!isValidDate(s)) return 'Invalid date';
    var d = new Date(dateToUTC(s));
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
  }
  function fmtDateLong(s) {
    if (!isValidDate(s)) return 'Invalid date';
    var d = new Date(dateToUTC(s));
    return WEEKDAYS[d.getUTCDay()] + ' ' + fmtDate(s, true);
  }
  function fmtDuration(min) {
    min = Math.round(Number.isFinite(min) ? min : 0);
    var h = Math.floor(min / 60), mm = min % 60;
    return h + ' h ' + pad2(mm) + ' min';
  }
  function fmtTimestamp(iso) {
    if (typeof iso !== 'string') return 'never';
    var d = new Date(iso);
    if (isNaN(d)) return 'never';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function sum(arr) { return arr.reduce(function (a, b) { return a + (Number.isFinite(b) ? b : 0); }, 0); }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function dietAllows(diet, food) {
    var level = DIETS[diet] ? DIETS[diet].level : 3;
    return food.dietLevel <= level;
  }

  /* ------------------------------------------------------------------ */
  /* Profile and targets                                                 */
  /* ------------------------------------------------------------------ */

  function validateProfile(input) {
    var src = isPlainObject(input) ? input : {};
    var errors = {};
    var value = {};
    if (src.sex === 'female' || src.sex === 'male') value.sex = src.sex;
    else errors.sex = 'Choose the sex used for the energy estimate.';
    var age = toNumber(src.age);
    if (!Number.isFinite(age)) errors.age = 'Enter your age in whole years.';
    else if (age < 18) errors.age = 'Fit30 Reset is for adults aged 18 and over. Please speak to a GP or school nurse instead.';
    else if (age > 90 || Math.round(age) !== age) errors.age = 'Enter a whole number of years between 18 and 90.';
    else value.age = age;
    var h = toNumber(src.heightCm);
    if (!Number.isFinite(h) || h < 120 || h > 230) errors.heightCm = 'Enter a height between 120 and 230 cm.';
    else value.heightCm = round1(h);
    var w = toNumber(src.weightKg);
    if (!Number.isFinite(w) || w < 35 || w > 250) errors.weightKg = 'Enter a weight between 35 and 250 kg.';
    else value.weightKg = round1(w);
    if (ACTIVITY[src.activity]) value.activity = src.activity;
    else errors.activity = 'Choose the activity level that fits a typical week.';
    value.deficit = DEFICITS[src.deficit] ? src.deficit : 'moderate';
    value.diet = DIETS[src.diet] ? src.diet : 'omnivore';
    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  function calcBMR(p) {
    var base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
    return p.sex === 'male' ? base + 5 : base - 161;
  }

  function calcTargets(profile) {
    var v = validateProfile(profile);
    if (!v.ok) return { ok: false, errors: v.errors };
    var p = v.value;
    var bmr = calcBMR(p);
    var maintenance = bmr * ACTIVITY[p.activity].factor;
    var requested = maintenance - DEFICITS[p.deficit].kcal;
    var floor = FLOORS[p.sex];
    var kcal = Math.round(Math.max(floor, Math.min(requested, maintenance)));
    var proteinWanted = Math.round(1.4 * p.weightKg);
    var proteinCap = Math.floor((kcal * 0.4) / 4);
    var protein = Math.min(proteinWanted, proteinCap);
    var fat = Math.round((kcal * 0.28) / 9);
    var carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    var waterMl = Math.min(4000, Math.max(1500, Math.round((p.weightKg * 35) / 50) * 50));
    return {
      ok: true,
      bmr: Math.round(bmr),
      maintenance: Math.round(maintenance),
      requested: Math.round(requested),
      floor: floor,
      floorApplied: requested < floor,
      maintenanceAtFloor: maintenance <= floor,
      proteinCapped: protein < proteinWanted,
      kcal: kcal, protein: protein, carbs: carbs, fat: fat,
      waterMl: waterMl, steps: 8000, sleepMin: 450
    };
  }

  function floorExplanation(t) {
    if (!t || !t.ok) return '';
    if (t.maintenanceAtFloor) {
      return 'Your estimated maintenance (' + fmtInt(t.maintenance) + ' kcal) is at or below the ' + fmtInt(t.floor) +
        ' kcal software floor, so the target is set to ' + fmtInt(t.floor) + ' kcal. Progress will come mainly from movement, ' +
        'sleep and consistency. Consider speaking to a GP or registered dietitian before reducing further.';
    }
    if (t.floorApplied) {
      return 'The deficit you chose would take you to ' + fmtInt(t.requested) + ' kcal, below the ' + fmtInt(t.floor) +
        ' kcal software floor, so your target is held at ' + fmtInt(t.floor) + ' kcal.';
    }
    return '';
  }

  function validateSplit(split) {
    var s = isPlainObject(split) ? split : {};
    var out = {};
    var errors = {};
    MEALS.forEach(function (k) {
      var n = toNumber(s[k]);
      if (!Number.isFinite(n) || n < 0 || n > 100 || Math.round(n) !== n) errors[k] = 'Enter a whole number from 0 to 100.';
      else out[k] = n;
    });
    var total = sum(MEALS.map(function (k) { return out[k]; }));
    if (!Object.keys(errors).length && total !== 100) errors.total = 'The four meals must total 100%. They currently total ' + total + '%.';
    return { ok: Object.keys(errors).length === 0, errors: errors, value: out, total: total };
  }

  function validateTargets(input) {
    var s = isPlainObject(input) ? input : {};
    var spec = {
      kcal: [800, 6000, 'Enter calories between 800 and 6,000 kcal.'],
      protein: [20, 400, 'Enter protein between 20 and 400 g.'],
      carbs: [0, 800, 'Enter carbohydrate between 0 and 800 g.'],
      fat: [10, 300, 'Enter fat between 10 and 300 g.'],
      waterMl: [500, 6000, 'Enter water between 500 and 6,000 ml.'],
      steps: [0, 50000, 'Enter a step target between 0 and 50,000.'],
      sleepMin: [180, 720, 'Enter sleep between 3 and 12 hours.']
    };
    var errors = {}, value = {};
    Object.keys(spec).forEach(function (k) {
      var n = toNumber(s[k]);
      if (!Number.isFinite(n) || n < spec[k][0] || n > spec[k][1]) errors[k] = spec[k][2];
      else value[k] = Math.round(n);
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  /* ------------------------------------------------------------------ */
  /* Diary entries                                                       */
  /* ------------------------------------------------------------------ */

  var ENTRY_SOURCES = ['library', 'custom', 'usda', 'off', 'meal'];

  function normalisePer100(raw) {
    var r = isPlainObject(raw) ? raw : {};
    var out = {
      kcal: clampNum(r.kcal, 0, 900, NaN),
      protein: clampNum(r.protein, 0, 100, NaN),
      carbs: clampNum(r.carbs, 0, 100, NaN),
      fat: clampNum(r.fat, 0, 100, NaN)
    };
    if (!Number.isFinite(out.kcal)) return null;
    ['protein', 'carbs', 'fat'].forEach(function (k) { if (!Number.isFinite(out[k])) out[k] = 0; });
    return out;
  }

  function normaliseEntry(raw) {
    if (!isPlainObject(raw)) return null;
    var food = typeof raw.foodId === 'string' ? FOOD_BY_ID[raw.foodId] : null;
    var per100 = normalisePer100(raw.per100);
    if (!per100 && food) per100 = { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat };
    if (!per100) return null;
    var grams = toNumber(raw.grams);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return null;
    var name = cleanText(raw.name, 120) || (food ? food.name : '');
    if (!name) return null;
    return {
      id: typeof raw.id === 'string' && /^[\w-]{1,60}$/.test(raw.id) ? raw.id : uid('e'),
      meal: MEALS.indexOf(raw.meal) >= 0 ? raw.meal : 'snacks',
      name: name,
      brand: cleanText(raw.brand, 80),
      foodId: food ? food.id : null,
      source: ENTRY_SOURCES.indexOf(raw.source) >= 0 ? raw.source : (food ? 'library' : 'custom'),
      grams: round1(grams),
      unit: raw.unit === 'ml' ? 'ml' : 'g',
      per100: per100,
      createdAt: typeof raw.createdAt === 'string' && !isNaN(new Date(raw.createdAt)) ? raw.createdAt : new Date(0).toISOString()
    };
  }

  function entryFromFood(food, grams, meal) {
    return normaliseEntry({
      meal: meal, foodId: food.id, name: food.name, source: 'library', grams: grams, unit: food.unit,
      per100: { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat },
      createdAt: new Date().toISOString()
    });
  }

  function entryTotals(entry) {
    if (!entry || !entry.per100) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    var f = (Number.isFinite(entry.grams) ? entry.grams : 0) / 100;
    return {
      kcal: f * (entry.per100.kcal || 0),
      protein: f * (entry.per100.protein || 0),
      carbs: f * (entry.per100.carbs || 0),
      fat: f * (entry.per100.fat || 0)
    };
  }

  function emptyTotals() { return { kcal: 0, protein: 0, carbs: 0, fat: 0 }; }
  function addTotals(a, b) {
    return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
  }

  function dayTotals(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var byMeal = {};
    MEALS.forEach(function (k) { byMeal[k] = emptyTotals(); });
    var total = emptyTotals();
    var vegGrams = 0;
    list.forEach(function (e) {
      var t = entryTotals(e);
      total = addTotals(total, t);
      if (byMeal[e.meal]) byMeal[e.meal] = addTotals(byMeal[e.meal], t);
      var food = e.foodId && FOOD_BY_ID[e.foodId];
      if (food && (food.category === 'veg' || food.category === 'fruit')) vegGrams += e.grams;
    });
    total.byMeal = byMeal;
    total.vegGrams = vegGrams;
    total.count = list.length;
    return total;
  }

  function validateCustomFood(input) {
    var s = isPlainObject(input) ? input : {};
    var errors = {};
    var name = cleanText(s.name, 120);
    if (!name) errors.name = 'Enter a food name.';
    var spec = { kcal: [0, 900, 'Energy must be between 0 and 900 kcal per 100 g.'], protein: [0, 100, 'Protein must be between 0 and 100 g per 100 g.'], carbs: [0, 100, 'Carbohydrate must be between 0 and 100 g per 100 g.'], fat: [0, 100, 'Fat must be between 0 and 100 g per 100 g.'], grams: [1, 2000, 'Portion must be between 1 and 2,000 g or ml.'] };
    var v = {};
    Object.keys(spec).forEach(function (k) {
      var raw = s[k];
      if (raw === '' || raw === null || raw === undefined) { errors[k] = (k === 'grams' ? 'Enter a portion size.' : 'Enter a value (use 0 if none).'); return; }
      var n = toNumber(raw);
      if (!Number.isFinite(n) || n < spec[k][0] || n > spec[k][1]) errors[k] = spec[k][2];
      else v[k] = n;
    });
    if (!errors.protein && !errors.carbs && !errors.fat && v.protein + v.carbs + v.fat > 100) {
      errors.fat = 'Protein, carbohydrate and fat cannot add up to more than 100 g per 100 g.';
    }
    if (!errors.kcal && !errors.protein && !errors.carbs && !errors.fat) {
      var est = v.protein * 4 + v.carbs * 4 + v.fat * 9;
      if (Math.abs(est - v.kcal) > Math.max(60, v.kcal * 0.35)) {
        errors.kcal = 'Energy does not match the macros (about ' + fmtInt(est) + ' kcal expected). Check the label.';
      }
    }
    return {
      ok: Object.keys(errors).length === 0, errors: errors,
      value: { name: name, unit: s.unit === 'ml' ? 'ml' : 'g', grams: v.grams, per100: { kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat } }
    };
  }

  function searchFoods(query, category, diet) {
    var q = cleanText(query, 60).toLowerCase();
    return FOODS.filter(function (f) {
      if (category && category !== 'all' && f.category !== category) return false;
      if (diet && !dietAllows(diet, f)) return false;
      if (q && f.name.toLowerCase().indexOf(q) === -1 && f.id.indexOf(q) === -1) return false;
      return true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Meal builder                                                        */
  /* ------------------------------------------------------------------ */

  function builderTotals(items, budget) {
    var list = Array.isArray(items) ? items : [];
    var total = emptyTotals();
    var groups = { protein: 0, carbs: 0, veg: 0, fruit: 0, fats: 0 };
    var unknown = 0;
    list.forEach(function (it) {
      var food = it && FOOD_BY_ID[it.foodId];
      var grams = it ? toNumber(it.grams) : NaN;
      if (!food || !Number.isFinite(grams) || grams <= 0) { unknown++; return; }
      var t = entryTotals({ grams: grams, per100: food });
      total = addTotals(total, t);
      groups[CATEGORIES[food.category].group] += t.kcal;
    });
    var b = toNumber(budget);
    var pct = {};
    Object.keys(groups).forEach(function (g) { pct[g] = total.kcal > 0 ? Math.round((groups[g] / total.kcal) * 100) : 0; });
    total.groups = groups;
    total.groupPct = pct;
    total.unknown = unknown;
    total.budget = Number.isFinite(b) && b > 0 ? b : 0;
    total.remaining = total.budget - total.kcal;
    return total;
  }

  function builderPrompts(t) {
    var out = [];
    if (t.kcal === 0) return ['Add a protein, a carbohydrate, vegetables and a little fat to build a balanced meal.'];
    if (t.budget && t.kcal > t.budget) out.push('This meal is ' + fmtInt(t.kcal - t.budget) + ' kcal over budget. Try a smaller carbohydrate or fat portion.');
    if (t.groupPct.protein < 20) out.push('Add a protein source to help fullness and recovery.');
    if (t.groups.veg === 0) out.push('Add vegetables for volume and fibre.');
    if (t.groupPct.fats > 40) out.push('Fats are a large share of this meal. A smaller portion of oil, nuts or cheese would free up calories.');
    if (!out.length) out.push('Nicely balanced. Save it to reuse later.');
    return out;
  }

  var SUGGEST_POOLS = {
    protein: ['chicken-breast', 'salmon', 'tofu', 'lentils', 'greek-yoghurt-0', 'eggs', 'tuna-tin', 'chickpeas', 'turkey-mince', 'tempeh', 'cod', 'cottage-cheese'],
    carbs: ['brown-rice', 'potatoes', 'quinoa', 'wholewheat-pasta', 'sweet-potato', 'couscous', 'wholemeal-bread', 'bulgur'],
    veg: ['broccoli', 'spinach', 'peppers', 'green-beans', 'courgette', 'carrots', 'tomatoes', 'cauliflower', 'mushrooms', 'kale'],
    fats: ['olive-oil', 'avocado', 'mixed-seeds', 'almonds', 'tahini']
  };

  function suggestBalancedMeal(budget, diet, seed) {
    var b = clampNum(budget, 150, 2000, 500);
    var s = Math.abs(Math.floor(clampNum(seed, 0, 1e6, 0)));
    function pick(pool, offset) {
      var ok = SUGGEST_POOLS[pool].filter(function (id) { return dietAllows(diet, FOOD_BY_ID[id]); });
      return FOOD_BY_ID[ok[(s + offset) % ok.length]];
    }
    var protein = pick('protein', 0), carb = pick('carbs', 1), veg1 = pick('veg', 2), veg2 = pick('veg', 5), fat = pick('fats', 3);
    if (veg2.id === veg1.id) veg2 = FOOD_BY_ID[veg1.id === 'broccoli' ? 'carrots' : 'broccoli'];
    var vegGrams = b >= 300 ? 80 : 50;
    var vegKcal = (veg1.kcal + veg2.kcal) * vegGrams / 100;
    var rest = Math.max(0, b - vegKcal);
    function grams(food, share) { return Math.max(5, Math.floor((rest * share / food.kcal) * 100 / 5) * 5); }
    var items = [
      { foodId: protein.id, grams: grams(protein, 0.42) },
      { foodId: carb.id, grams: grams(carb, 0.40) },
      { foodId: veg1.id, grams: vegGrams },
      { foodId: veg2.id, grams: vegGrams },
      { foodId: fat.id, grams: grams(fat, 0.12) }
    ];
    var guard = 0;
    while (builderTotals(items, b).kcal > b && guard++ < 200) {
      var biggest = items.slice(0, 2).concat(items[4]).sort(function (x, y) {
        return FOOD_BY_ID[y.foodId].kcal * y.grams - FOOD_BY_ID[x.foodId].kcal * x.grams;
      })[0];
      biggest.grams = Math.max(5, biggest.grams - 5);
    }
    return items;
  }

  /* ------------------------------------------------------------------ */
  /* Groceries                                                           */
  /* ------------------------------------------------------------------ */

  function generateGroceries(plans, week, household, previous) {
    var w = [1, 2, 3, 4].indexOf(Number(week)) >= 0 ? Number(week) : 1;
    var hh = Math.round(clampNum(household, 1, 8, 1));
    var days = plans && Array.isArray(plans[w]) ? plans[w] : buildTemplateWeek(w);
    var totals = {};
    days.forEach(function (day) {
      MEALS.forEach(function (meal) {
        (day && Array.isArray(day[meal]) ? day[meal] : []).forEach(function (it) {
          var food = FOOD_BY_ID[it.foodId];
          var g = toNumber(it.grams);
          if (!food || !Number.isFinite(g) || g <= 0) return;
          totals[food.id] = (totals[food.id] || 0) + g;
        });
      });
    });
    var items = Object.keys(totals).map(function (id) {
      var food = FOOD_BY_ID[id];
      return {
        id: 'g-' + id, foodId: id, name: food.name, qty: Math.ceil((totals[id] * hh) / 10) * 10, unit: food.unit,
        aisle: CATEGORIES[food.category].aisle, checked: false, custom: false
      };
    });
    var custom = (Array.isArray(previous) ? previous : []).filter(function (it) { return it && it.custom; });
    items = items.concat(custom);
    items.sort(function (a, b) {
      var d = AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle);
      return d !== 0 ? d : a.name.localeCompare(b.name, 'en-GB');
    });
    return { week: w, household: hh, items: items, generatedFor: 'week-' + w + '-x' + hh };
  }

  function groceriesToText(g) {
    var lines = ['Fit30 Reset grocery list — week ' + g.week + ', household of ' + g.household, ''];
    AISLE_ORDER.forEach(function (aisle) {
      var items = g.items.filter(function (i) { return i.aisle === aisle; });
      if (!items.length) return;
      lines.push(aisle.toUpperCase());
      items.forEach(function (i) { lines.push((i.checked ? '[x] ' : '[ ] ') + i.name + (i.qty ? ' — ' + fmtInt(i.qty) + ' ' + i.unit : '')); });
      lines.push('');
    });
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Mission, phases and training                                        */
  /* ------------------------------------------------------------------ */

  function missionInfo(startDate, date) {
    if (!isValidDate(startDate) || !isValidDate(date)) {
      return { status: 'unset', day: 0, rawDay: 0, phase: 1, startDate: null, endDate: null };
    }
    var raw = diffDays(startDate, date) + 1;
    var status = raw < 1 ? 'before' : raw > MISSION_DAYS ? 'after' : 'active';
    var day = Math.min(MISSION_DAYS, Math.max(1, raw));
    return { status: status, day: day, rawDay: raw, phase: phaseForDay(day), startDate: startDate, endDate: addDays(startDate, MISSION_DAYS - 1) };
  }

  function phaseForDay(day) {
    var d = toNumber(day);
    if (!Number.isFinite(d) || d <= 7) return 1;
    if (d <= 14) return 2;
    if (d <= 21) return 3;
    return 4;
  }

  function sessionTypeForDay(day) {
    var d = Math.min(MISSION_DAYS, Math.max(1, Math.round(clampNum(day, 1, MISSION_DAYS, 1))));
    var idx = (d - 1) % 7;
    var week = Math.floor((d - 1) / 7) + 1;
    var pattern = ['S1', 'aerobic', 'S2', 'rest', 'S3', 'aerobic', 'rest'];
    var slot = pattern[idx];
    if (slot === 'aerobic' || slot === 'rest') return slot;
    var odd = week % 2 === 1;
    if (slot === 'S2') return odd ? 'strength-b' : 'strength-a';
    return odd ? 'strength-a' : 'strength-b';
  }

  function buildExercise(id, phase, minimum) {
    var ex = EXERCISES[id];
    var p = PHASES[phase] || PHASES[1];
    var isTime = ex.kind === 'time';
    return {
      id: id, name: ex.name,
      sets: minimum ? 2 : p.sets,
      reps: isTime ? 0 : (minimum ? 8 : p.reps),
      loadKg: 0,
      durationSec: isTime ? (id === 'march' ? 180 : (id === 'farmer-carry' ? p.holdSec + 10 : p.holdSec)) : 0,
      notes: ''
    };
  }

  function buildSession(type, phase) {
    var t = WORKOUT_TYPES.indexOf(type) >= 0 ? type : 'rest';
    var p = PHASES[phase] ? phase : 1;
    var ids = [];
    var aerobicMin = 0;
    if (t === 'strength-a') ids = SESSION_EXERCISES['strength-a'].concat(['dead-bug', 'side-plank']);
    else if (t === 'strength-b') ids = SESSION_EXERCISES['strength-b'].concat(['bird-dog', 'plank']);
    else if (t === 'minimum') ids = ['chair-squat', 'push-up', 'glute-bridge', 'dead-bug', 'march'];
    else if (t === 'aerobic') aerobicMin = PHASES[p].aerobicMin;
    return {
      type: t, title: WORKOUT_TITLES[t],
      exercises: ids.map(function (id) { return buildExercise(id, p, t === 'minimum'); }),
      completed: false, stopped: false, difficulty: null, symptoms: [], painNote: '', notes: '',
      aerobicMin: aerobicMin, updatedAt: null
    };
  }

  function weekRangeFor(state, date) {
    var info = missionInfo(state && state.mission && state.mission.startDate, date);
    if (info.status === 'active') {
      var idx = Math.floor((info.day - 1) / 7);
      var from = addDays(info.startDate, idx * 7);
      var to = addDays(from, 6);
      if (diffDays(info.endDate, to) > 0) to = info.endDate;
      return { from: from, to: to, label: 'Mission week ' + (idx + 1) };
    }
    return { from: addDays(date, -6), to: date, label: 'Last 7 days' };
  }

  function trainingStats(workouts, from, to) {
    var out = { strength: 0, core: 0, aerobicMin: 0, completed: 0, stopped: 0, minimum: 0 };
    if (!isPlainObject(workouts) || !isValidDate(from) || !isValidDate(to)) return out;
    Object.keys(workouts).forEach(function (d) {
      if (!isValidDate(d) || diffDays(from, d) < 0 || diffDays(d, to) < 0) return;
      var w = workouts[d];
      if (!w) return;
      if (w.completed || w.stopped) out.aerobicMin += Number.isFinite(w.aerobicMin) ? w.aerobicMin : 0;
      if (w.stopped) { out.stopped++; return; }
      if (!w.completed) return;
      out.completed++;
      if (w.type === 'strength-a' || w.type === 'strength-b') { out.strength++; out.core++; }
      if (w.type === 'minimum') out.minimum++;
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Adherence and progress                                              */
  /* ------------------------------------------------------------------ */

  function adherenceForDay(state, date) {
    var t = state.targets;
    var entries = state.diary[date] || [];
    var totals = dayTotals(entries);
    var h = state.health[date] || {};
    var w = state.workouts[date];
    var info = missionInfo(state.mission.startDate, date);
    var scheduledRest = info.status === 'active' && sessionTypeForDay(info.day) === 'rest';
    var flags = {
      food: entries.length > 0,
      calories: entries.length > 0 && totals.kcal >= t.kcal * 0.7 && totals.kcal <= t.kcal * 1.05,
      protein: entries.length > 0 && totals.protein >= t.protein * 0.9,
      movement: !!(w && w.completed) || (scheduledRest && !(w && w.stopped)),
      steps: Number.isFinite(h.steps) && h.steps >= t.steps
    };
    var score = Object.keys(flags).filter(function (k) { return flags[k]; }).length;
    return { date: date, flags: flags, score: score, max: 5 };
  }

  function sevenDayAdherence(state, endDate) {
    var days = [];
    for (var i = 6; i >= 0; i--) days.push(adherenceForDay(state, addDays(endDate, -i)));
    var pct = Math.round((sum(days.map(function (d) { return d.score; })) / 35) * 100);
    return { days: days, pct: pct };
  }

  function dateRange(from, to) {
    var out = [];
    if (!isValidDate(from) || !isValidDate(to)) return out;
    var n = diffDays(from, to);
    if (n < 0 || n > 400) return out;
    for (var i = 0; i <= n; i++) out.push(addDays(from, i));
    return out;
  }

  function rollingAverage(points, windowDays) {
    var last = -1;
    points.forEach(function (p, i) { if (Number.isFinite(p.value)) last = i; });
    return points.map(function (p, i) {
      if (i > last) return { date: p.date, value: null };
      var vals = [];
      for (var j = Math.max(0, i - windowDays + 1); j <= i; j++) if (Number.isFinite(points[j].value)) vals.push(points[j].value);
      return { date: p.date, value: vals.length ? round1(sum(vals) / vals.length) : null };
    });
  }

  function progressStats(state, from, to) {
    var dates = dateRange(from, to);
    var logged = dates.filter(function (d) { return (state.diary[d] || []).length > 0; });
    var kcals = logged.map(function (d) { return dayTotals(state.diary[d]).kcal; });
    var proteins = logged.map(function (d) { return dayTotals(state.diary[d]).protein; });
    var steps = dates.map(function (d) { return (state.health[d] || {}).steps; }).filter(Number.isFinite);
    var sleep = dates.map(function (d) { return (state.health[d] || {}).sleepMin; }).filter(Number.isFinite);
    var weights = dates.map(function (d) { return { date: d, value: (state.health[d] || {}).weightKg }; }).filter(function (p) { return Number.isFinite(p.value); });
    var waists = dates.map(function (d) { return (state.health[d] || {}).waistCm; }).filter(Number.isFinite);
    var tr = trainingStats(state.workouts, from, to);
    var adherence = dates.map(function (d) { return adherenceForDay(state, d).score; });
    function avg(a) { return a.length ? sum(a) / a.length : null; }
    return {
      days: dates.length, daysLogged: logged.length,
      avgKcal: avg(kcals), avgProtein: avg(proteins), avgSteps: avg(steps), avgSleep: avg(sleep),
      weightChange: weights.length >= 2 ? round1(weights[weights.length - 1].value - weights[0].value) : null,
      waistChange: waists.length >= 2 ? round1(waists[waists.length - 1] - waists[0]) : null,
      workoutsCompleted: tr.completed, workoutsStopped: tr.stopped, strengthSessions: tr.strength, aerobicMin: tr.aerobicMin,
      adherencePct: dates.length ? Math.round((sum(adherence) / (dates.length * 5)) * 100) : 0
    };
  }

  /* ------------------------------------------------------------------ */
  /* Barcodes                                                            */
  /* ------------------------------------------------------------------ */

  function gs1CheckDigitValid(code) {
    var digits = code.split('').map(Number);
    var check = digits.pop();
    var total = 0;
    for (var i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) total += digits[i] * w;
    return (10 - (total % 10)) % 10 === check;
  }

  function validateBarcode(input) {
    var code = typeof input === 'string' ? input.replace(/[\s-]/g, '') : (typeof input === 'number' ? String(input) : '');
    if (!code) return { ok: false, error: 'Enter the digits printed under the barcode.' };
    if (!/^\d+$/.test(code)) return { ok: false, error: 'A barcode contains digits only.' };
    if ([8, 12, 13, 14].indexOf(code.length) === -1) return { ok: false, error: 'Barcodes have 8, 12, 13 or 14 digits. This one has ' + code.length + '.' };
    if (!gs1CheckDigitValid(code)) return { ok: false, error: 'The check digit does not match. Please re-type the number.' };
    return { ok: true, code: code };
  }

  function safeImageUrl(url) {
    if (typeof url !== 'string' || url.length > 500) return '';
    var m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>]*)?$/i.exec(url);
    if (!m) return '';
    var host = m[1].toLowerCase();
    if (host === 'wger.de' || host === 'openfoodfacts.org' || /\.openfoodfacts\.org$/.test(host)) return url;
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  var CAPS = { dates: 400, entries: 60, savedMeals: 100, mealItems: 30, planItems: 12, groceries: 200, prep: 60, exercises: 15 };

  function defaultState(now) {
    var ts = (now instanceof Date && !isNaN(now) ? now : new Date()).toISOString();
    return {
      version: 1,
      profile: { sex: null, age: null, heightCm: null, weightKg: null, activity: null, deficit: 'moderate', diet: 'omnivore', onboarded: false },
      targets: { kcal: 1600, protein: 100, carbs: 170, fat: 50, waterMl: 2000, steps: 8000, sleepMin: 450, source: 'default' },
      mission: { startDate: null },
      diary: {},
      health: {},
      savedMeals: [],
      mealSplit: { breakfast: DEFAULT_SPLIT.breakfast, lunch: DEFAULT_SPLIT.lunch, dinner: DEFAULT_SPLIT.dinner, snacks: DEFAULT_SPLIT.snacks },
      plans: defaultPlans(),
      groceries: { week: 1, household: 1, items: [], generatedFor: null },
      prep: { date: null, items: [], notes: '', reminder: { enabled: false, time: '20:00', lastNotified: null } },
      workouts: {},
      builder: { name: '', budget: 500, items: [], editingId: null, diet: 'omnivore' },
      ui: { theme: 'system' },
      meta: { createdAt: ts, lastSaved: null }
    };
  }

  function isoOrNull(v) { return typeof v === 'string' && v.length < 40 && !isNaN(new Date(v)) ? new Date(v).toISOString() : null; }
  function intOrNull(v, min, max) { var n = toNumber(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null; }
  function numOrNull(v, min, max) { var n = toNumber(v); return Number.isFinite(n) && n >= min && n <= max ? round1(n) : null; }
  function safeId(v, prefix) { return typeof v === 'string' && /^[\w-]{1,60}$/.test(v) ? v : uid(prefix); }

  function normaliseItems(list, cap) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < cap; i++) {
      var it = list[i];
      if (!isPlainObject(it) || !FOOD_BY_ID[it.foodId]) continue;
      var g = toNumber(it.grams);
      if (!Number.isFinite(g) || g <= 0 || g > 2000) continue;
      out.push({ foodId: it.foodId, grams: Math.round(g) });
    }
    return out;
  }

  function normaliseHealth(raw) {
    if (!isPlainObject(raw)) return null;
    var h = {
      weightKg: numOrNull(raw.weightKg, 30, 300),
      waistCm: numOrNull(raw.waistCm, 40, 200),
      steps: intOrNull(raw.steps, 0, 100000),
      sleepMin: intOrNull(raw.sleepMin, 0, 1440),
      waterMl: intOrNull(raw.waterMl, 0, 10000),
      hunger: intOrNull(raw.hunger, 1, 5),
      energy: intOrNull(raw.energy, 1, 5),
      notes: cleanText(raw.notes, 500),
      updatedAt: isoOrNull(raw.updatedAt)
    };
    var hasData = ['weightKg', 'waistCm', 'steps', 'sleepMin', 'waterMl', 'hunger', 'energy'].some(function (k) { return h[k] !== null; }) || h.notes;
    return hasData ? h : null;
  }

  function normaliseExercise(raw) {
    if (!isPlainObject(raw)) return null;
    var name = cleanText(raw.name, 80) || (EXERCISES[raw.id] ? EXERCISES[raw.id].name : '');
    if (!name) return null;
    return {
      id: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : 'custom',
      name: name,
      sets: intOrNull(raw.sets, 0, 20) || 0,
      reps: intOrNull(raw.reps, 0, 200) || 0,
      loadKg: numOrNull(raw.loadKg, 0, 500) || 0,
      durationSec: intOrNull(raw.durationSec, 0, 7200) || 0,
      notes: cleanText(raw.notes, 300)
    };
  }

  function normaliseWorkout(raw) {
    if (!isPlainObject(raw) || WORKOUT_TYPES.indexOf(raw.type) === -1) return null;
    var exercises = (Array.isArray(raw.exercises) ? raw.exercises : []).map(normaliseExercise).filter(Boolean).slice(0, CAPS.exercises);
    var symptoms = (Array.isArray(raw.symptoms) ? raw.symptoms : []).filter(function (s, i, a) { return WARNING_SYMPTOMS[s] && a.indexOf(s) === i; });
    var stopped = raw.stopped === true;
    var completed = raw.completed === true && !stopped;
    if (completed && symptoms.length) { completed = false; stopped = true; }
    return {
      type: raw.type,
      title: cleanText(raw.title, 80) || WORKOUT_TITLES[raw.type],
      exercises: exercises,
      completed: completed, stopped: stopped,
      difficulty: intOrNull(raw.difficulty, 1, 10),
      symptoms: symptoms,
      painNote: cleanText(raw.painNote, 500),
      notes: cleanText(raw.notes, 1000),
      aerobicMin: intOrNull(raw.aerobicMin, 0, 600) || 0,
      updatedAt: isoOrNull(raw.updatedAt)
    };
  }

  function normaliseDateMap(raw, fn) {
    var out = {};
    if (!isPlainObject(raw)) return out;
    var keys = Object.keys(raw).filter(isValidDate).sort().slice(-CAPS.dates);
    keys.forEach(function (k) { var v = fn(raw[k]); if (v !== null && v !== undefined) out[k] = v; });
    return out;
  }

  function normaliseState(raw) {
    var src = isPlainObject(raw) ? raw : {};
    if (isPlainObject(src.data) && (src.app === APP_ID || src.schema !== undefined)) src = src.data;
    var s = defaultState();

    var p = isPlainObject(src.profile) ? src.profile : {};
    var pv = validateProfile(p);
    s.profile = {
      sex: p.sex === 'male' || p.sex === 'female' ? p.sex : null,
      age: intOrNull(p.age, 18, 90),
      heightCm: numOrNull(p.heightCm, 120, 230),
      weightKg: numOrNull(p.weightKg, 35, 250),
      activity: ACTIVITY[p.activity] ? p.activity : null,
      deficit: DEFICITS[p.deficit] ? p.deficit : 'moderate',
      diet: DIETS[p.diet] ? p.diet : 'omnivore',
      onboarded: p.onboarded === true && pv.ok
    };

    var t = isPlainObject(src.targets) ? src.targets : {};
    var def = s.targets;
    s.targets = {
      kcal: intOrNull(t.kcal, 800, 6000) || def.kcal,
      protein: intOrNull(t.protein, 20, 400) || def.protein,
      carbs: intOrNull(t.carbs, 0, 800) !== null ? intOrNull(t.carbs, 0, 800) : def.carbs,
      fat: intOrNull(t.fat, 10, 300) || def.fat,
      waterMl: intOrNull(t.waterMl, 500, 6000) || def.waterMl,
      steps: intOrNull(t.steps, 0, 50000) !== null ? intOrNull(t.steps, 0, 50000) : def.steps,
      sleepMin: intOrNull(t.sleepMin, 180, 720) || def.sleepMin,
      source: ['default', 'calculated', 'manual'].indexOf(t.source) >= 0 ? t.source : 'default'
    };

    s.mission.startDate = isPlainObject(src.mission) && isValidDate(src.mission.startDate) ? src.mission.startDate : null;

    s.diary = normaliseDateMap(src.diary, function (list) {
      if (!Array.isArray(list)) return null;
      var entries = list.map(normaliseEntry).filter(Boolean).slice(0, CAPS.entries);
      return entries.length ? entries : null;
    });
    s.health = normaliseDateMap(src.health, normaliseHealth);
    s.workouts = normaliseDateMap(src.workouts, normaliseWorkout);

    s.savedMeals = (Array.isArray(src.savedMeals) ? src.savedMeals : []).filter(isPlainObject).slice(0, CAPS.savedMeals).map(function (sm) {
      var items = normaliseItems(sm.items, CAPS.mealItems);
      var name = cleanText(sm.name, 80);
      if (!items.length || !name) return null;
      return { id: safeId(sm.id, 'm'), name: name, budget: intOrNull(sm.budget, 100, 3000) || 500, items: items, createdAt: isoOrNull(sm.createdAt) || new Date(0).toISOString() };
    }).filter(Boolean);

    var split = validateSplit(src.mealSplit);
    if (split.ok) s.mealSplit = split.value;

    var plans = isPlainObject(src.plans) ? src.plans : {};
    [1, 2, 3, 4].forEach(function (w) {
      var week = plans[w];
      if (!Array.isArray(week) || week.length !== 7 || !week.every(isPlainObject)) return;
      s.plans[w] = week.map(function (day) {
        var out = {};
        MEALS.forEach(function (meal) { out[meal] = normaliseItems(day[meal], CAPS.planItems); });
        return out;
      });
    });

    var g = isPlainObject(src.groceries) ? src.groceries : {};
    s.groceries = {
      week: intOrNull(g.week, 1, 4) || 1,
      household: intOrNull(g.household, 1, 8) || 1,
      items: (Array.isArray(g.items) ? g.items : []).filter(isPlainObject).slice(0, CAPS.groceries).map(function (it) {
        var name = cleanText(it.name, 80);
        if (!name) return null;
        return {
          id: safeId(it.id, 'g'), foodId: FOOD_BY_ID[it.foodId] ? it.foodId : null, name: name,
          qty: numOrNull(it.qty, 0, 100000) || 0, unit: cleanText(it.unit, 12),
          aisle: AISLE_ORDER.indexOf(it.aisle) >= 0 ? it.aisle : 'Other', checked: it.checked === true, custom: it.custom === true
        };
      }).filter(Boolean),
      generatedFor: typeof g.generatedFor === 'string' ? cleanText(g.generatedFor, 40) : null
    };

    var pr = isPlainObject(src.prep) ? src.prep : {};
    var rem = isPlainObject(pr.reminder) ? pr.reminder : {};
    s.prep = {
      date: isValidDate(pr.date) ? pr.date : null,
      items: (Array.isArray(pr.items) ? pr.items : []).filter(isPlainObject).slice(0, CAPS.prep).map(function (it) {
        var text = cleanText(it.text, 120);
        return text ? { id: safeId(it.id, 'p'), text: text, done: it.done === true, custom: it.custom === true } : null;
      }).filter(Boolean),
      notes: cleanText(pr.notes, 1000),
      reminder: {
        enabled: rem.enabled === true,
        time: typeof rem.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(rem.time) ? rem.time : '20:00',
        lastNotified: isValidDate(rem.lastNotified) ? rem.lastNotified : null
      }
    };

    var b = isPlainObject(src.builder) ? src.builder : {};
    s.builder = {
      name: cleanText(b.name, 80), budget: intOrNull(b.budget, 100, 3000) || 500,
      items: normaliseItems(b.items, CAPS.mealItems),
      editingId: typeof b.editingId === 'string' && /^[\w-]{1,60}$/.test(b.editingId) ? b.editingId : null,
      diet: DIETS[b.diet] ? b.diet : s.profile.diet
    };

    s.ui.theme = isPlainObject(src.ui) && THEMES.indexOf(src.ui.theme) >= 0 ? src.ui.theme : 'system';
    var meta = isPlainObject(src.meta) ? src.meta : {};
    s.meta = { createdAt: isoOrNull(meta.createdAt) || s.meta.createdAt, lastSaved: isoOrNull(meta.lastSaved) };
    return s;
  }

  function parseImport(text) {
    var data;
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The file is empty.' };
    if (text.length > 5 * 1024 * 1024) return { ok: false, error: 'The file is larger than 5 MB, which is too big for a Fit30 Reset backup.' };
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'This file is not valid JSON, so nothing was changed.' }; }
    if (!isPlainObject(data)) return { ok: false, error: 'This file does not contain a Fit30 Reset backup.' };
    var payload = null;
    if (isPlainObject(data.data) && (data.app === APP_ID || data.schema !== undefined)) payload = data.data;
    else if (['version', 'profile', 'diary', 'targets', 'workouts', 'health'].some(function (k) { return k in data; })) payload = data;
    if (!payload) return { ok: false, error: 'This file does not look like a Fit30 Reset backup, so nothing was changed.' };
    var state = normaliseState(payload);
    return { ok: true, state: state, summary: { diaryDays: Object.keys(state.diary).length, healthDays: Object.keys(state.health).length, workouts: Object.keys(state.workouts).length } };
  }

  function exportPayload(state) {
    return { app: APP_ID, schema: SCHEMA, exportedAt: new Date().toISOString(), data: state };
  }

  function hasMeaningfulData(state) {
    return !!(state && (state.profile.onboarded || Object.keys(state.diary).length || Object.keys(state.health).length ||
      Object.keys(state.workouts).length || state.savedMeals.length));
  }

  function validateHealth(input) {
    var s = isPlainObject(input) ? input : {};
    var spec = {
      weightKg: [30, 300, 'Enter a weight between 30 and 300 kg.', false],
      waistCm: [40, 200, 'Enter a waist measurement between 40 and 200 cm.', false],
      steps: [0, 100000, 'Enter steps as a whole number from 0 to 100,000.', true],
      sleepHours: [0, 16, 'Enter sleep between 0 and 16 hours.', false],
      waterMl: [0, 10000, 'Enter water between 0 and 10,000 ml.', true],
      hunger: [1, 5, 'Choose hunger from 1 to 5.', true],
      energy: [1, 5, 'Choose energy from 1 to 5.', true]
    };
    var errors = {}, value = {};
    Object.keys(spec).forEach(function (k) {
      var raw = s[k];
      if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) { value[k] = null; return; }
      var n = toNumber(raw);
      var sp = spec[k];
      if (!Number.isFinite(n) || n < sp[0] || n > sp[1] || (sp[3] && Math.round(n) !== n)) errors[k] = sp[2];
      else value[k] = n;
    });
    var out = {
      weightKg: value.weightKg === null || value.weightKg === undefined ? null : round1(value.weightKg),
      waistCm: value.waistCm === null || value.waistCm === undefined ? null : round1(value.waistCm),
      steps: value.steps === undefined ? null : value.steps,
      sleepMin: value.sleepHours === null || value.sleepHours === undefined ? null : Math.round(value.sleepHours * 60),
      waterMl: value.waterMl === undefined ? null : value.waterMl,
      hunger: value.hunger === undefined ? null : value.hunger,
      energy: value.energy === undefined ? null : value.energy,
      notes: cleanText(s.notes, 500)
    };
    return { ok: Object.keys(errors).length === 0, errors: errors, value: out };
  }

  /* ------------------------------------------------------------------ */
  /* Charts (hand-written SVG)                                           */
  /* ------------------------------------------------------------------ */

  var CH = { w: 600, h: 200, l: 46, r: 12, t: 14, b: 26 };

  function chartScale(values) {
    var finite = values.filter(Number.isFinite);
    if (!finite.length) return { min: 0, max: 1 };
    var min = Math.min.apply(null, finite), max = Math.max.apply(null, finite);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.1;
    return { min: min - pad, max: max + pad };
  }
  function xPos(i, n) { return CH.l + (n <= 1 ? (CH.w - CH.l - CH.r) / 2 : (i * (CH.w - CH.l - CH.r)) / (n - 1)); }
  function yPos(v, sc) { return CH.t + (1 - (v - sc.min) / (sc.max - sc.min)) * (CH.h - CH.t - CH.b); }
  function c1(n) { return Number.isFinite(n) ? n.toFixed(1) : '0'; }

  function chartFrame(id, title, desc, body, sc, points, decimals, emptyText) {
    var labels = '';
    if (points.length) {
      labels += '<text class="chart-axis" x="' + CH.l + '" y="' + (CH.h - 6) + '">' + esc(fmtDate(points[0].date)) + '</text>';
      labels += '<text class="chart-axis" x="' + (CH.w - CH.r) + '" y="' + (CH.h - 6) + '" text-anchor="end">' + esc(fmtDate(points[points.length - 1].date)) + '</text>';
    }
    if (body) {
      labels += '<text class="chart-axis" x="' + (CH.l - 6) + '" y="' + (CH.t + 4) + '" text-anchor="end">' + esc(decimals ? fmt1(sc.max) : fmtInt(sc.max)) + '</text>';
      labels += '<text class="chart-axis" x="' + (CH.l - 6) + '" y="' + (CH.h - CH.b) + '" text-anchor="end">' + esc(decimals ? fmt1(sc.min) : fmtInt(sc.min)) + '</text>';
    } else {
      labels += '<text class="chart-empty" x="' + (CH.w / 2) + '" y="' + (CH.h / 2) + '" text-anchor="middle">' + esc(emptyText || 'No entries yet') + '</text>';
    }
    return '<svg class="chart-svg" viewBox="0 0 ' + CH.w + ' ' + CH.h + '" role="img" aria-labelledby="' + esc(id) + '-t ' + esc(id) + '-d" preserveAspectRatio="xMidYMid meet">' +
      '<title id="' + esc(id) + '-t">' + esc(title) + '</title><desc id="' + esc(id) + '-d">' + esc(desc) + '</desc>' +
      '<line class="chart-gridline" x1="' + CH.l + '" x2="' + (CH.w - CH.r) + '" y1="' + (CH.h - CH.b) + '" y2="' + (CH.h - CH.b) + '"/>' +
      '<line class="chart-gridline" x1="' + CH.l + '" x2="' + CH.l + '" y1="' + CH.t + '" y2="' + (CH.h - CH.b) + '"/>' +
      body + labels + '</svg>';
  }

  function dataTable(caption, headers, rows) {
    return '<div class="visually-hidden"><table><caption>' + esc(caption) + '</caption><thead><tr>' +
      headers.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return i === 0 ? '<th scope="row">' + esc(c) + '</th>' : '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('')
        : '<tr><td colspan="' + headers.length + '">No data recorded</td></tr>') + '</tbody></table></div>';
  }

  function lineChart(opts) {
    var points = Array.isArray(opts.points) ? opts.points : [];
    var avg = Array.isArray(opts.avg) ? opts.avg : null;
    var target = Number.isFinite(opts.target) ? opts.target : null;
    var unit = opts.unit || '';
    var dec = !!opts.decimals;
    var vals = points.map(function (p) { return p.value; });
    var finite = vals.filter(Number.isFinite);
    var sc = chartScale(finite.concat(avg ? avg.map(function (p) { return p.value; }) : []).concat(finite.length && target !== null ? [target] : []));
    var n = points.length;
    var body = '';
    if (finite.length) {
      if (target !== null) {
        var ty = yPos(target, sc);
        body += '<line class="chart-target" x1="' + CH.l + '" x2="' + (CH.w - CH.r) + '" y1="' + c1(ty) + '" y2="' + c1(ty) + '"/>';
      }
      var coords = [];
      points.forEach(function (p, i) { if (Number.isFinite(p.value)) coords.push([xPos(i, n), yPos(p.value, sc)]); });
      if (coords.length > 1) body += '<polyline class="chart-line" points="' + coords.map(function (c) { return c1(c[0]) + ',' + c1(c[1]); }).join(' ') + '"/>';
      body += coords.map(function (c) { return '<circle class="chart-dot" cx="' + c1(c[0]) + '" cy="' + c1(c[1]) + '" r="3.5"/>'; }).join('');
      if (avg) {
        var ac = [];
        avg.forEach(function (p, i) { if (Number.isFinite(p.value)) ac.push(c1(xPos(i, n)) + ',' + c1(yPos(p.value, sc))); });
        if (ac.length > 1) body += '<polyline class="chart-avg" points="' + ac.join(' ') + '"/>';
      }
    }
    var summary = opts.summary || (finite.length ? finite.length + (finite.length === 1 ? ' entry' : ' entries') + '. Latest ' + (dec ? fmt1(finite[finite.length - 1]) : fmtInt(finite[finite.length - 1])) + ' ' + unit + '.' : 'No data recorded yet.');
    var rows = points.filter(function (p, i) { return Number.isFinite(p.value) || (avg && Number.isFinite(avg[i] && avg[i].value)); }).map(function (p) {
      var i = points.indexOf(p);
      var r = [fmtDate(p.date, true), Number.isFinite(p.value) ? (dec ? fmt1(p.value) : fmtInt(p.value)) + ' ' + unit : '—'];
      if (avg) r.push(avg[i] && Number.isFinite(avg[i].value) ? fmt1(avg[i].value) + ' ' + unit : '—');
      return r;
    });
    var headers = ['Date', opts.title + ' (' + unit + ')'];
    if (avg) headers.push('Seven-day average');
    var legend = finite.length ? '<ul class="chart-legend" aria-hidden="true"><li><span class="key key-line"></span>' + esc(opts.seriesLabel || opts.title) + '</li>' +
      (avg ? '<li><span class="key key-avg"></span>Seven-day average</li>' : '') +
      (target !== null ? '<li><span class="key key-target"></span>' + esc(opts.targetLabel || 'Target') + '</li>' : '') + '</ul>' : '';
    return '<figure class="chart">' + chartFrame(opts.id, opts.title, summary, body, sc, points, dec, opts.emptyText) + legend +
      '<figcaption class="chart-summary">' + esc(summary) + '</figcaption>' + dataTable(opts.title + ' data', headers, rows) + '</figure>';
  }

  function barChart(opts) {
    var points = Array.isArray(opts.points) ? opts.points : [];
    var target = Number.isFinite(opts.target) ? opts.target : null;
    var unit = opts.unit || '';
    var dec = !!opts.decimals;
    var finite = points.map(function (p) { return p.value; }).filter(Number.isFinite);
    var maxV = Math.max.apply(null, [1].concat(finite).concat(target !== null ? [target] : []));
    var sc = { min: 0, max: maxV * 1.1 };
    var n = Math.max(1, points.length);
    var slot = (CH.w - CH.l - CH.r) / n;
    var bw = Math.max(2, slot * 0.7);
    var body = '';
    if (finite.length) {
      points.forEach(function (p, i) {
        if (!Number.isFinite(p.value)) return;
        var y = yPos(p.value, sc);
        var over = target !== null && opts.overIsWarning && p.value > target;
        body += '<rect class="chart-bar' + (over ? ' is-over' : '') + '" x="' + c1(CH.l + i * slot + (slot - bw) / 2) + '" y="' + c1(y) + '" width="' + c1(bw) + '" height="' + c1(Math.max(0, CH.h - CH.b - y)) + '"/>';
      });
      if (target !== null) {
        var ty = yPos(target, sc);
        body += '<line class="chart-target" x1="' + CH.l + '" x2="' + (CH.w - CH.r) + '" y1="' + c1(ty) + '" y2="' + c1(ty) + '"/>';
      }
    }
    var summary = opts.summary || (finite.length ? finite.length + (finite.length === 1 ? ' entry' : ' entries') + ', average ' + (dec ? fmt1(sum(finite) / finite.length) : fmtInt(sum(finite) / finite.length)) + ' ' + unit + (target !== null ? ' against a target of ' + (dec ? fmt1(target) : fmtInt(target)) + ' ' + unit : '') + '.' : 'No data recorded yet.');
    var rows = points.filter(function (p) { return Number.isFinite(p.value); }).map(function (p) {
      return [p.label || fmtDate(p.date, true), (dec ? fmt1(p.value) : fmtInt(p.value)) + ' ' + unit];
    });
    var labelled = points.map(function (p) { return { date: p.date }; });
    return '<figure class="chart">' + chartFrame(opts.id, opts.title, summary, body, sc, labelled.length && labelled[0].date ? labelled : [], dec, opts.emptyText) +
      '<figcaption class="chart-summary">' + esc(summary) + '</figcaption>' + dataTable(opts.title + ' data', [opts.firstHeader || 'Date', opts.title + ' (' + unit + ')'], rows) + '</figure>';
  }

  /* ------------------------------------------------------------------ */
  /* Shared view helpers                                                 */
  /* ------------------------------------------------------------------ */

  function viewTitle(text, sub) {
    return '<header class="view-header"><h1 id="view-title" tabindex="-1">' + esc(text) + '</h1>' + (sub ? '<p class="view-sub">' + sub + '</p>' : '') + '</header>';
  }

  function field(o) {
    var id = o.id;
    var err = o.error ? '<p class="field-error" id="' + esc(id) + '-error">' + esc(o.error) + '</p>' : '';
    var hint = o.hint ? '<p class="field-hint" id="' + esc(id) + '-hint">' + esc(o.hint) + '</p>' : '';
    var described = [o.hint ? id + '-hint' : '', o.error ? id + '-error' : ''].filter(Boolean).join(' ');
    var aria = (described ? ' aria-describedby="' + esc(described) + '"' : '') + (o.error ? ' aria-invalid="true"' : '');
    var control;
    var val = o.value === null || o.value === undefined || (typeof o.value === 'number' && !Number.isFinite(o.value)) ? '' : o.value;
    if (o.type === 'select') {
      control = '<select id="' + esc(id) + '" name="' + esc(o.name) + '"' + aria + (o.action ? ' data-action="' + esc(o.action) + '"' : '') + (o.required ? ' required' : '') + '>' +
        (o.placeholder ? '<option value="">' + esc(o.placeholder) + '</option>' : '') +
        o.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(val) ? ' selected' : '') + '>' + esc(op[1]) + '</option>'; }).join('') + '</select>';
    } else if (o.type === 'textarea') {
      control = '<textarea id="' + esc(id) + '" name="' + esc(o.name) + '" rows="' + (o.rows || 3) + '" maxlength="' + (o.maxlength || 500) + '"' + aria + (o.action ? ' data-action="' + esc(o.action) + '"' : '') + '>' + esc(String(val)) + '</textarea>';
    } else {
      control = '<input id="' + esc(id) + '" name="' + esc(o.name) + '" type="' + esc(o.type || 'text') + '" value="' + esc(String(val)) + '"' + aria +
        (o.inputmode ? ' inputmode="' + esc(o.inputmode) + '"' : '') + (o.step ? ' step="' + esc(o.step) + '"' : '') +
        (o.min !== undefined ? ' min="' + esc(String(o.min)) + '"' : '') + (o.max !== undefined ? ' max="' + esc(String(o.max)) + '"' : '') +
        (o.autocomplete ? ' autocomplete="' + esc(o.autocomplete) + '"' : '') + (o.action ? ' data-action="' + esc(o.action) + '"' : '') +
        (o.live ? ' data-live="' + esc(o.live) + '"' : '') + (o.extra || '') + '>';
    }
    return '<div class="field' + (o.error ? ' has-error' : '') + (o.className ? ' ' + o.className : '') + '"><label for="' + esc(id) + '">' + esc(o.label) +
      (o.suffix ? ' <span class="field-unit">(' + esc(o.suffix) + ')</span>' : '') + '</label>' + hint + control + err + '</div>';
  }

  function optionsFrom(map) { return Object.keys(map).map(function (k) { return [k, map[k].label]; }); }

  function icon(name) {
    var paths = {
      check: '<path d="M4 12.5l5 5L20 6.5"/>',
      alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      minus: '<path d="M5 12h14"/>',
      left: '<path d="M15 5l-7 7 7 7"/>',
      right: '<path d="M9 5l7 7-7 7"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
      edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
      stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
      camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
      download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (paths[name] || '') + '</svg>';
  }

  function notice(kind, html, role) {
    return '<div class="notice notice-' + kind + '"' + (role ? ' role="' + role + '"' : '') + '>' + icon(kind === 'warning' || kind === 'danger' ? 'alert' : 'info') + '<div>' + html + '</div></div>';
  }

  function safetyNotice() {
    return '<section class="safety" aria-labelledby="safety-title"><h2 id="safety-title">Safety first</h2>' +
      '<p>Fit30 Reset is educational software for generally healthy adults. It is not medical diagnosis, treatment or personalised clinical care.</p>' +
      '<p><strong>Seek clinical advice before starting</strong> if you are pregnant or postpartum, under 18, frail, have or have had an eating disorder, kidney disease, uncontrolled diabetes, significant heart disease, recent surgery, or serious back or pelvic-floor problems.</p>' +
      '<p><strong>Stop exercising and seek help</strong> if you notice chest pain, faintness, severe breathlessness, neurological symptoms such as numbness, weakness or changes in vision or speech, or sharp or radiating pain. In an emergency call 999 or 112.</p></section>';
  }

  function heroHTML() {
    return '<section class="hero" aria-labelledby="hero-title"><p class="eyebrow">Fit30 Reset · a 30-day plan</p>' +
      '<h1 id="hero-title" tabindex="-1">Lose up to <strong>3 kg</strong> in 30 days. Keep the habits.</h1>' +
      '<p class="hero-lede">A calm, structured month of balanced eating, strength training and walking. 3 kg is an ambitious upper target, not a promise — many people lose less, and that is fine. Your waist measurement, fitness and consistency count just as much as the scales.</p>' +
      '<p class="hero-fineprint">Free · No account required · Local by default, optional Google sync</p></section>';
  }

  function calorieRing(consumed, target) {
    var c = Number.isFinite(consumed) ? consumed : 0;
    var t = Number.isFinite(target) && target > 0 ? target : 1;
    var frac = Math.min(1, c / t);
    var r = 52, circ = 2 * Math.PI * r;
    var over = c > t;
    var diff = Math.abs(Math.round(t - c));
    var label = over ? fmtInt(diff) + ' kcal over' : fmtInt(diff) + ' kcal left';
    return '<div class="ring-wrap"><svg class="ring' + (over ? ' is-over' : '') + '" viewBox="0 0 120 120" role="img" aria-label="' + esc(fmtInt(c) + ' of ' + fmtInt(t) + ' kcal eaten, ' + label) + '">' +
      '<circle class="ring-track" cx="60" cy="60" r="' + r + '"/>' +
      '<circle class="ring-fill" cx="60" cy="60" r="' + r + '" stroke-dasharray="' + c1(circ * frac) + ' ' + c1(circ) + '" transform="rotate(-90 60 60)"/>' +
      '<text x="60" y="56" text-anchor="middle" class="ring-big">' + esc(fmtInt(diff)) + '</text>' +
      '<text x="60" y="74" text-anchor="middle" class="ring-small">' + (over ? 'kcal over' : 'kcal left') + '</text></svg>' +
      '<p class="ring-caption">' + esc(fmtInt(c)) + ' / ' + esc(fmtInt(t)) + ' kcal' + (over ? ' <span class="badge badge-warn">Over target</span>' : '') + '</p></div>';
  }

  function meter(label, value, target, unit) {
    var v = Number.isFinite(value) ? value : 0;
    var t = Number.isFinite(target) && target > 0 ? target : 0;
    var pct = t ? Math.min(100, Math.round((v / t) * 100)) : 0;
    return '<div class="meter"><div class="meter-head"><span>' + esc(label) + '</span><span>' + esc(fmtInt(v)) + ' / ' + esc(fmtInt(t)) + ' ' + esc(unit) + '</span></div>' +
      '<div class="meter-track" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-valuetext="' + esc(fmtInt(v) + ' of ' + fmtInt(t) + ' ' + unit) + '"><span class="meter-fill" style="width:' + pct + '%"></span></div></div>';
  }

  function dateBar(prefix, date, today) {
    return '<div class="date-bar" role="group" aria-label="Choose date">' +
      '<button type="button" class="btn btn-icon" data-action="' + prefix + '-date-prev" aria-label="Previous day">' + icon('left') + '</button>' +
      '<label class="visually-hidden" for="' + prefix + '-date">Date</label><input type="date" id="' + prefix + '-date" value="' + esc(date) + '" data-action="' + prefix + '-date-set" min="2000-01-01" max="2100-12-31">' +
      '<button type="button" class="btn btn-icon" data-action="' + prefix + '-date-next" aria-label="Next day">' + icon('right') + '</button>' +
      '<button type="button" class="btn btn-ghost" data-action="' + prefix + '-date-today"' + (date === today ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>Today</button>' +
      '<span class="date-bar-label">' + esc(fmtDateLong(date)) + (date === today ? ' · today' : '') + '</span></div>';
  }

  function makeContext(overrides) {
    var today = todayISO();
    var ctx = {
      today: today,
      ui: {
        foodDate: today, foodMeal: 'breakfast', foodTab: 'library', foodQuery: '', foodCat: 'all',
        usda: { status: 'idle', message: '', results: [] },
        barcode: { status: 'idle', message: '', product: null, cameraSupported: false },
        plannerTab: 'builder', planWeek: 1, planDay: 0, builderSeed: 0,
        trainDate: today, wger: { status: 'idle', message: '', results: [] },
        healthDate: today, errors: {}, drafts: {}
      },
      account: { status: 'disabled', message: 'Accounts are not configured on this site.', user: null, syncEnabled: false, lastUpload: null }
    };
    if (isPlainObject(overrides)) {
      Object.keys(overrides).forEach(function (k) {
        if (k === 'ui' && isPlainObject(overrides.ui)) Object.keys(overrides.ui).forEach(function (u) { ctx.ui[u] = overrides.ui[u]; });
        else ctx[k] = overrides[k];
      });
    }
    return ctx;
  }

  function errs(ctx, form) { return (ctx.ui.errors && ctx.ui.errors[form]) || {}; }
  function draft(ctx, form) { return (ctx.ui.drafts && ctx.ui.drafts[form]) || null; }

  /* ------------------------------------------------------------------ */
  /* Views: onboarding and dashboard                                     */
  /* ------------------------------------------------------------------ */

  function profileFields(prefix, values, e) {
    var v = values || {};
    return '<fieldset class="field' + (e.sex ? ' has-error' : '') + '"' + (e.sex ? ' aria-describedby="' + prefix + '-sex-error"' : '') + '><legend>Sex used for the energy estimate</legend><div class="choice-row">' +
      ['female', 'male'].map(function (s, i) {
        return '<label class="choice"><input type="radio" name="sex" id="' + prefix + '-sex' + (i ? '-' + s : '') + '" value="' + s + '"' + (v.sex === s ? ' checked' : '') + (e.sex ? ' aria-invalid="true"' : '') + '> ' + (s === 'female' ? 'Female' : 'Male') + '</label>';
      }).join('') + '</div>' + (e.sex ? '<p class="field-error" id="' + prefix + '-sex-error">' + esc(e.sex) + '</p>' : '') + '</fieldset>' +
      '<div class="grid-3">' +
      field({ id: prefix + '-age', name: 'age', label: 'Age', suffix: 'years', type: 'number', inputmode: 'numeric', min: 18, max: 90, step: '1', value: v.age, error: e.age }) +
      field({ id: prefix + '-heightCm', name: 'heightCm', label: 'Height', suffix: 'cm', type: 'number', inputmode: 'decimal', min: 120, max: 230, step: '0.1', value: v.heightCm, error: e.heightCm }) +
      field({ id: prefix + '-weightKg', name: 'weightKg', label: 'Current weight', suffix: 'kg', type: 'number', inputmode: 'decimal', min: 35, max: 250, step: '0.1', value: v.weightKg, error: e.weightKg }) +
      '</div>' +
      field({ id: prefix + '-activity', name: 'activity', label: 'Typical activity', type: 'select', placeholder: 'Choose an activity level', options: optionsFrom(ACTIVITY), value: v.activity, error: e.activity }) +
      '<div class="grid-2">' +
      field({ id: prefix + '-deficit', name: 'deficit', label: 'Pace', type: 'select', options: optionsFrom(DEFICITS), value: v.deficit || 'moderate' }) +
      field({ id: prefix + '-diet', name: 'diet', label: 'Eating pattern', type: 'select', options: optionsFrom(DIETS), value: v.diet || 'omnivore' }) +
      '</div>';
  }

  function renderOnboarding(state, ctx) {
    var e = errs(ctx, 'onboarding');
    var d = draft(ctx, 'onboarding') || state.profile;
    var start = (draft(ctx, 'onboarding') || {}).startDate || state.mission.startDate || ctx.today;
    return heroHTML() + safetyNotice() +
      '<section class="card onboarding" aria-labelledby="onb-title"><h2 id="onb-title">Set up your 30 days</h2>' +
      '<p>Your details stay on this device. They are used only to estimate a starting calorie and protein target, which you can change at any time.</p>' +
      '<form data-action="onboarding-submit" novalidate>' + profileFields('onb', d, e) +
      field({ id: 'onb-start', name: 'startDate', label: 'Day 1 of your mission', type: 'date', value: start, error: e.startDate }) +
      '<button type="submit" class="btn btn-primary">Calculate my targets</button></form></section>';
  }

  function renderDashboard(state, ctx) {
    if (!state.profile.onboarded) return renderOnboarding(state, ctx);
    var today = ctx.today;
    var info = missionInfo(state.mission.startDate, today);
    var t = state.targets;
    var totals = dayTotals(state.diary[today]);
    var h = state.health[today] || {};
    var latest = null;
    Object.keys(state.health).sort().forEach(function (d) { if (diffDays(d, today) >= 0 && Number.isFinite(state.health[d].weightKg)) latest = { date: d, kg: state.health[d].weightKg }; });
    var w = state.workouts[today];
    var plannedType = info.status === 'active' ? sessionTypeForDay(info.day) : null;
    var adh = sevenDayAdherence(state, today);
    var missionLine;
    if (info.status === 'unset') missionLine = 'Mission start date not set.';
    else if (info.status === 'before') missionLine = 'Your mission starts on ' + fmtDate(info.startDate, true) + ' (in ' + (1 - info.rawDay) + ' day' + (1 - info.rawDay === 1 ? '' : 's') + ').';
    else if (info.status === 'after') missionLine = 'Mission complete: ' + fmtDate(info.startDate) + ' – ' + fmtDate(info.endDate, true) + '. Keep the habits going.';
    else missionLine = 'Day ' + info.day + ' of 30 · ' + fmtDate(info.startDate) + ' – ' + fmtDate(info.endDate, true) + ' · Phase ' + info.phase + ': ' + PHASES[info.phase].name;

    var calc = calcTargets(state.profile);
    var floorNote = t.source === 'calculated' ? floorExplanation(calc) : '';
    var workoutStatus = w ? (w.completed ? 'Completed' : w.stopped ? 'Stopped early — recorded' : 'In progress') : 'Not started';
    var workoutTitle = w ? w.title : (plannedType ? WORKOUT_TITLES[plannedType] : 'Free choice');

    return viewTitle('Today', esc(fmtDateLong(today))) +
      '<p class="mission-line">' + esc(missionLine) + '</p>' +
      (floorNote ? notice('info', '<p>' + esc(floorNote) + '</p>') : '') +
      '<div class="dash-grid">' +
      '<section class="card card-calories" aria-labelledby="dash-cal"><h2 id="dash-cal">Calories</h2>' + calorieRing(totals.kcal, t.kcal) +
      '<a class="btn btn-secondary" href="#food">Log food</a></section>' +
      '<section class="card" aria-labelledby="dash-macros"><h2 id="dash-macros">Macros</h2>' +
      meter('Protein', totals.protein, t.protein, 'g') + meter('Carbohydrate', totals.carbs, t.carbs, 'g') + meter('Fat', totals.fat, t.fat, 'g') + '</section>' +
      '<section class="card" aria-labelledby="dash-water"><h2 id="dash-water">Water</h2>' + meter('Water', h.waterMl || 0, t.waterMl, 'ml') +
      '<div class="btn-row"><button type="button" class="btn btn-secondary" data-action="water-add" data-amount="250">' + icon('plus') + ' 250 ml</button>' +
      '<button type="button" class="btn btn-ghost" data-action="water-add" data-amount="-250">' + icon('minus') + ' 250 ml</button></div></section>' +
      '<section class="card" aria-labelledby="dash-move"><h2 id="dash-move">Steps and sleep</h2>' +
      meter('Steps', h.steps || 0, t.steps, 'steps') +
      '<p class="stat-line"><span>Sleep last night</span><strong>' + (Number.isFinite(h.sleepMin) ? esc(fmtDuration(h.sleepMin)) : 'Not logged') + '</strong></p>' +
      '<p class="stat-line"><span>Latest weight</span><strong>' + (latest ? esc(fmt1(latest.kg)) + ' kg <span class="muted">(' + esc(fmtDate(latest.date)) + ')</span>' : 'Not logged') + '</strong></p>' +
      '<a class="btn btn-secondary" href="#progress">Log health check-in</a></section>' +
      '<section class="card" aria-labelledby="dash-workout"><h2 id="dash-workout">Today\u2019s workout</h2><p class="lead-small">' + esc(workoutTitle) + '</p>' +
      '<p><span class="badge' + (w && w.completed ? ' badge-ok' : w && w.stopped ? ' badge-warn' : '') + '">' + (w && w.completed ? icon('check') : '') + esc(workoutStatus) + '</span></p>' +
      '<a class="btn btn-secondary" href="#training">Open training</a></section>' +
      '<section class="card card-wide" aria-labelledby="dash-adh"><h2 id="dash-adh">Seven-day adherence</h2><p>' + esc(adh.pct) + '% of daily habits met over the last seven days.</p>' +
      '<ol class="adherence">' + adh.days.map(function (d) {
        var met = Object.keys(d.flags).filter(function (k) { return d.flags[k]; });
        return '<li class="adh-day score-' + d.score + '"><span class="adh-date">' + esc(fmtDate(d.date)) + '</span><span class="adh-score">' + d.score + '/5</span>' +
          '<span class="visually-hidden">Met: ' + esc(met.length ? met.join(', ') : 'none') + '</span></li>';
      }).join('') + '</ol><p class="muted small">Habits: food logged, calories in range, protein met, workout or planned rest, steps target.</p></section>' +
      '</div>' +
      '<nav class="quick-links" aria-label="Sections"><h2 class="visually-hidden">Go to</h2>' +
      [['#food', 'Food diary', 'Log meals, search foods, scan barcodes'], ['#planner', 'Planner', 'Meal builder, weekly templates, groceries'], ['#training', 'Training', 'Today\u2019s session and the 30-day plan'],
        ['#progress', 'Progress', 'Check-ins, charts and trends'], ['#learn', 'Learn', 'How it works and staying safe'], ['#settings', 'Settings', 'Targets, account, data']].map(function (l) {
        return '<a class="quick-link" href="' + l[0] + '"><strong>' + esc(l[1]) + '</strong><span>' + esc(l[2]) + '</span></a>';
      }).join('') + '</nav>';
  }

  /* ------------------------------------------------------------------ */
  /* Views: food diary                                                   */
  /* ------------------------------------------------------------------ */

  function foodPrompts(totals, t) {
    var out = [];
    if (!totals.count) return ['Nothing logged yet for this day. Add your first meal below.'];
    if (totals.kcal > t.kcal) out.push('You are ' + fmtInt(totals.kcal - t.kcal) + ' kcal over this day\u2019s target. That happens — the weekly picture matters more than one day.');
    if (totals.count >= 2 && totals.protein < t.protein * 0.75) out.push('Protein so far: ' + fmtInt(totals.protein) + ' g of ' + fmtInt(t.protein) + ' g. A protein-rich meal or snack would help with fullness.');
    if (totals.count >= 2 && totals.vegGrams < 240) out.push('About ' + fmtInt(totals.vegGrams) + ' g of fruit and vegetables logged. Five portions is roughly 400 g across the day.');
    return out;
  }

  function renderFoodResults(query, cat, diet) {
    var results = searchFoods(query, cat, null);
    if (!results.length) return '<p class="muted" role="status">No foods match. Try a shorter word, another category, or add a custom food.</p>';
    return '<p class="visually-hidden" role="status">' + results.length + ' foods found</p><ul class="food-results">' + results.slice(0, 60).map(function (f) {
      var off = diet && !dietAllows(diet, f);
      return '<li class="food-row"><div class="food-row-main"><span class="food-name">' + esc(f.name) + '</span>' +
        '<span class="food-meta">' + esc(CATEGORIES[f.category].label) + ' · ' + esc(fmtInt(f.kcal)) + ' kcal, ' + esc(fmt1(f.protein)) + ' g protein per 100 ' + esc(f.unit) + (off ? ' · outside your eating pattern' : '') + '</span></div>' +
        '<button type="button" class="btn btn-secondary btn-small" data-action="food-add-open" data-food-id="' + esc(f.id) + '">Add<span class="visually-hidden"> ' + esc(f.name) + '</span></button></li>';
    }).join('') + '</ul>';
  }

  function productCard(p) {
    var img = safeImageUrl(p.image);
    return '<div class="product-card">' + (img ? '<img src="' + esc(img) + '" alt="" width="96" height="96" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '<div><p class="food-name">' + esc(p.name || 'Unnamed product') + '</p>' + (p.brand ? '<p class="food-meta">' + esc(p.brand) + '</p>' : '') +
      (p.serving ? '<p class="food-meta">Serving: ' + esc(p.serving) + '</p>' : '') +
      '<p class="food-meta">Per 100 ' + esc(p.unit === 'ml' ? 'ml' : 'g') + ': ' + esc(fmtInt(p.kcal)) + ' kcal · ' + esc(fmt1(p.protein)) + ' g protein · ' + esc(fmt1(p.carbs)) + ' g carbohydrate · ' + esc(fmt1(p.fat)) + ' g fat</p></div></div>';
  }

  function renderFood(state, ctx) {
    var ui = ctx.ui;
    var date = isValidDate(ui.foodDate) ? ui.foodDate : ctx.today;
    var entries = state.diary[date] || [];
    var totals = dayTotals(entries);
    var t = state.targets;
    var remaining = t.kcal - totals.kcal;
    var e = errs(ctx, 'custom');
    var cd = draft(ctx, 'custom') || {};
    var tabs = [['library', 'Food library'], ['usda', 'Online search'], ['barcode', 'Barcode'], ['custom', 'Custom food']];
    var panel = '';
    if (ui.foodTab === 'usda') {
      var u = ui.usda || { status: 'idle', results: [] };
      panel = '<form class="inline-form" data-action="usda-search" novalidate role="search">' +
        field({ id: 'usda-q', name: 'q', label: 'Search USDA FoodData Central', type: 'search', value: u.query || '', hint: 'Needs a connection. Your search words are sent to the site\u2019s server, which asks USDA.' }) +
        '<button type="submit" class="btn btn-primary">Search</button></form>' +
        '<div role="status" aria-live="polite" class="api-status">' + (u.status === 'loading' ? 'Searching…' : u.message ? esc(u.message) : '') + '</div>' +
        (u.results && u.results.length ? '<ul class="food-results">' + u.results.map(function (r, i) {
          return '<li class="food-row"><div class="food-row-main"><span class="food-name">' + esc(r.name) + '</span><span class="food-meta">' + (r.brand ? esc(r.brand) + ' · ' : '') +
            esc(fmtInt(r.kcal)) + ' kcal, ' + esc(fmt1(r.protein)) + ' g protein per 100 g</span></div>' +
            '<button type="button" class="btn btn-secondary btn-small" data-action="usda-add" data-index="' + i + '">Add<span class="visually-hidden"> ' + esc(r.name) + '</span></button></li>';
        }).join('') + '</ul><p class="attribution">Data: USDA FoodData Central (public domain).</p>' : '');
    } else if (ui.foodTab === 'barcode') {
      var bc = ui.barcode || { status: 'idle' };
      panel = (bc.cameraSupported ? '<p><button type="button" class="btn btn-secondary" data-action="barcode-scan-start">' + icon('camera') + ' Scan with camera</button></p>' :
        notice('info', '<p>Camera scanning is not available in this browser, so type the number printed under the barcode instead.</p>')) +
        '<form class="inline-form" data-action="barcode-lookup" novalidate>' +
        field({ id: 'barcode-code', name: 'code', label: 'Barcode number', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: bc.code || '', error: bc.status === 'invalid' ? bc.message : '', hint: '8, 12, 13 or 14 digits.' }) +
        '<button type="submit" class="btn btn-primary">Look up</button></form>' +
        '<div role="status" aria-live="polite" class="api-status">' + (bc.status === 'loading' ? 'Looking up…' : bc.status !== 'invalid' && bc.message ? esc(bc.message) : '') + '</div>' +
        (bc.product ? productCard(bc.product) + notice('warning', '<p>Open Food Facts is crowd-sourced. Check these values against the label before relying on them.</p>') +
          '<p class="attribution">Product data from Open Food Facts, available under the Open Database Licence (ODbL).</p>' +
          '<button type="button" class="btn btn-primary" data-action="barcode-add">Add to ' + esc(MEAL_LABELS[ui.foodMeal] || 'meal') + '</button>' : '');
    } else if (ui.foodTab === 'custom') {
      panel = '<form data-action="custom-food-submit" novalidate><p class="muted">Enter values per 100 g or 100 ml from the label.</p>' +
        field({ id: 'cf-name', name: 'name', label: 'Food name', value: cd.name, error: e.name, autocomplete: 'off' }) +
        '<div class="grid-4">' +
        field({ id: 'cf-kcal', name: 'kcal', label: 'Energy', suffix: 'kcal', type: 'number', inputmode: 'decimal', min: 0, max: 900, step: 'any', value: cd.kcal, error: e.kcal }) +
        field({ id: 'cf-protein', name: 'protein', label: 'Protein', suffix: 'g', type: 'number', inputmode: 'decimal', min: 0, max: 100, step: 'any', value: cd.protein, error: e.protein }) +
        field({ id: 'cf-carbs', name: 'carbs', label: 'Carbohydrate', suffix: 'g', type: 'number', inputmode: 'decimal', min: 0, max: 100, step: 'any', value: cd.carbs, error: e.carbs }) +
        field({ id: 'cf-fat', name: 'fat', label: 'Fat', suffix: 'g', type: 'number', inputmode: 'decimal', min: 0, max: 100, step: 'any', value: cd.fat, error: e.fat }) +
        '</div><div class="grid-2">' +
        field({ id: 'cf-grams', name: 'grams', label: 'Portion eaten', type: 'number', inputmode: 'decimal', min: 1, max: 2000, step: 'any', value: cd.grams, error: e.grams }) +
        field({ id: 'cf-unit', name: 'unit', label: 'Unit', type: 'select', options: [['g', 'grams'], ['ml', 'millilitres']], value: cd.unit || 'g' }) +
        '</div><button type="submit" class="btn btn-primary">Add to ' + esc(MEAL_LABELS[ui.foodMeal] || 'meal') + '</button></form>';
    } else {
      panel = '<div class="filter-row" role="search">' +
        field({ id: 'food-search', name: 'q', label: 'Search the food library', type: 'search', value: ui.foodQuery, live: 'food-search', autocomplete: 'off' }) +
        field({ id: 'food-cat', name: 'cat', label: 'Category', type: 'select', options: [['all', 'All categories']].concat(Object.keys(CATEGORIES).map(function (k) { return [k, CATEGORIES[k].label]; })), value: ui.foodCat, action: 'food-cat-set' }) +
        '</div><div id="food-results">' + renderFoodResults(ui.foodQuery, ui.foodCat, state.profile.diet) + '</div>' +
        '<p class="muted small">' + FOODS.length + ' everyday foods, available offline. Values are typical averages per 100 g or 100 ml.</p>';
    }
    return viewTitle('Food diary') + dateBar('food', date, ctx.today) +
      '<section class="card diary-summary" aria-labelledby="diary-sum"><h2 id="diary-sum" class="visually-hidden">Day summary</h2><div class="summary-grid">' +
      '<p class="big-stat"><span>Eaten</span><strong>' + esc(fmtInt(totals.kcal)) + ' kcal</strong></p>' +
      '<p class="big-stat"><span>' + (remaining >= 0 ? 'Remaining' : 'Over target') + '</span><strong class="' + (remaining < 0 ? 'is-over' : '') + '">' + esc(fmtInt(Math.abs(remaining))) + ' kcal</strong></p>' +
      '<p class="big-stat"><span>Protein</span><strong>' + esc(fmtInt(totals.protein)) + ' / ' + esc(fmtInt(t.protein)) + ' g</strong></p>' +
      '<p class="big-stat"><span>Carbohydrate · Fat</span><strong>' + esc(fmtInt(totals.carbs)) + ' g · ' + esc(fmtInt(totals.fat)) + ' g</strong></p></div>' +
      '<ul class="prompts">' + foodPrompts(totals, t).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></section>' +
      '<div class="meals">' + MEALS.map(function (meal) {
        var list = entries.filter(function (x) { return x.meal === meal; });
        var mt = totals.byMeal[meal];
        var share = Math.round(t.kcal * (state.mealSplit[meal] || 0) / 100);
        return '<section class="card meal" aria-labelledby="meal-' + meal + '"><div class="meal-head"><h2 id="meal-' + meal + '">' + esc(MEAL_LABELS[meal]) + '</h2>' +
          '<p class="meal-total">' + esc(fmtInt(mt.kcal)) + ' <span class="muted">/ ' + esc(fmtInt(share)) + ' kcal</span></p></div>' +
          (list.length ? '<ul class="entries">' + list.map(function (en) {
            var et = entryTotals(en);
            return '<li class="entry"><div class="entry-main"><span class="food-name">' + esc(en.name) + '</span><span class="food-meta">' + esc(fmt1(en.grams)) + ' ' + esc(en.unit) +
              (en.brand ? ' · ' + esc(en.brand) : '') + ' · ' + esc(fmtInt(et.protein)) + ' g protein</span></div><span class="entry-kcal">' + esc(fmtInt(et.kcal)) + ' kcal</span>' +
              '<div class="entry-actions"><button type="button" class="btn btn-icon" data-action="entry-edit" data-id="' + esc(en.id) + '" aria-label="Edit portion of ' + esc(en.name) + '">' + icon('edit') + '</button>' +
              '<button type="button" class="btn btn-icon btn-danger-ghost" data-action="entry-delete" data-id="' + esc(en.id) + '" aria-label="Delete ' + esc(en.name) + '">' + icon('trash') + '</button></div></li>';
          }).join('') + '</ul>' : '<p class="muted">Nothing logged.</p>') +
          '<button type="button" class="btn btn-ghost" data-action="food-add-to-meal" data-meal="' + meal + '">' + icon('plus') + ' Add to ' + esc(MEAL_LABELS[meal].toLowerCase()) + '</button></section>';
      }).join('') + '</div>' +
      '<section class="card add-food" aria-labelledby="add-food-title" id="add-food"><h2 id="add-food-title" tabindex="-1">Add food</h2>' +
      field({ id: 'food-meal', name: 'meal', label: 'Add to meal', type: 'select', options: MEALS.map(function (k) { return [k, MEAL_LABELS[k]]; }), value: ui.foodMeal, action: 'food-meal-set' }) +
      '<div class="tabs" role="group" aria-label="Ways to add food">' + tabs.map(function (tb) {
        return '<button type="button" class="tab" data-action="food-tab" data-tab="' + tb[0] + '" aria-pressed="' + (ui.foodTab === tb[0] ? 'true' : 'false') + '">' + esc(tb[1]) + '</button>';
      }).join('') + '</div><div class="tab-panel">' + panel + '</div></section>';
  }

  function renderAddDialog(food, ctx, date) {
    var grams = food.portion || 100;
    var unit = food.unit === 'ml' ? 'ml' : 'g';
    return '<form method="dialog" data-action="add-entry-submit" novalidate><h2 id="dialog-title">Add ' + esc(food.name) + '</h2>' +
      (food.brand ? '<p class="muted">' + esc(food.brand) + '</p>' : '') +
      '<p class="muted">' + esc(fmtInt(food.kcal)) + ' kcal per 100 ' + unit + ' · logging for ' + esc(fmtDateLong(date)) + '</p>' +
      field({ id: 'add-grams', name: 'grams', label: 'Portion', suffix: unit, type: 'number', inputmode: 'decimal', min: 1, max: 2000, step: 'any', value: grams, live: 'add-preview' }) +
      field({ id: 'add-meal', name: 'meal', label: 'Meal', type: 'select', options: MEALS.map(function (k) { return [k, MEAL_LABELS[k]]; }), value: ctx.ui.foodMeal }) +
      '<p class="preview" id="add-preview" aria-live="polite">' + esc(fmtInt(food.kcal * grams / 100)) + ' kcal · ' + esc(fmt1(food.protein * grams / 100)) + ' g protein</p>' +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="dialog-close">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div></form>';
  }

  function renderEditEntryDialog(entry, error) {
    return '<form method="dialog" data-action="entry-edit-submit" data-id="' + esc(entry.id) + '" novalidate><h2 id="dialog-title">Edit portion</h2><p>' + esc(entry.name) + '</p>' +
      field({ id: 'edit-grams', name: 'grams', label: 'Portion', suffix: entry.unit, type: 'number', inputmode: 'decimal', min: 1, max: 5000, step: 'any', value: entry.grams, error: error }) +
      field({ id: 'edit-meal', name: 'meal', label: 'Meal', type: 'select', options: MEALS.map(function (k) { return [k, MEAL_LABELS[k]]; }), value: entry.meal }) +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="dialog-close">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>';
  }

  /* ------------------------------------------------------------------ */
  /* Views: planner                                                      */
  /* ------------------------------------------------------------------ */

  function foodOptions(diet) {
    return Object.keys(CATEGORIES).map(function (c) {
      return '<optgroup label="' + esc(CATEGORIES[c].label) + '">' + FOODS.filter(function (f) { return f.category === c && (!diet || dietAllows(diet, f)); }).map(function (f) {
        return '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  function itemsKcal(items) { return builderTotals(items, 0).kcal; }

  function builderTotalsHTML(t) {
    var over = t.budget && t.kcal > t.budget;
    var pct = t.budget ? Math.min(100, Math.round((t.kcal / t.budget) * 100)) : 0;
    return '<p class="big-stat"><span>Meal total</span><strong class="' + (over ? 'is-over' : '') + '">' + esc(fmtInt(t.kcal)) + ' / ' + esc(fmtInt(t.budget)) + ' kcal</strong></p>' +
      '<div class="meter-track" role="progressbar" aria-label="Share of budget" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span class="meter-fill' + (over ? ' is-over' : '') + '" style="width:' + pct + '%"></span></div>' +
      '<p class="muted">' + esc(fmtInt(t.protein)) + ' g protein · ' + esc(fmtInt(t.carbs)) + ' g carbohydrate · ' + esc(fmtInt(t.fat)) + ' g fat</p>' +
      '<ul class="group-list">' + [['protein', 'Protein foods'], ['carbs', 'Carbohydrates'], ['veg', 'Vegetables'], ['fruit', 'Fruit'], ['fats', 'Fats']].map(function (g) {
        return '<li><span>' + esc(g[1]) + '</span><span>' + esc(t.groupPct[g[0]]) + '%</span></li>';
      }).join('') + '</ul>' + (t.unknown ? '<p class="muted small">' + t.unknown + ' unrecognised item(s) ignored.</p>' : '') +
      '<ul class="prompts">' + builderPrompts(t).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
  }

  function renderBuilder(state, ctx) {
    var b = state.builder;
    var t = builderTotals(b.items, b.budget);
    var e = errs(ctx, 'builder');
    return '<section class="card" aria-labelledby="builder-title"><h2 id="builder-title">Meal builder</h2>' +
      '<div class="grid-3">' +
      field({ id: 'builder-name', name: 'name', label: 'Meal name', value: b.name, action: 'builder-name', error: e.name, autocomplete: 'off' }) +
      field({ id: 'builder-budget', name: 'budget', label: 'Calorie budget', suffix: 'kcal', type: 'number', inputmode: 'numeric', min: 100, max: 3000, value: b.budget, action: 'builder-budget', error: e.budget }) +
      field({ id: 'builder-diet', name: 'diet', label: 'Eating pattern', type: 'select', options: optionsFrom(DIETS), value: b.diet, action: 'builder-diet' }) +
      '</div>' +
      (b.items.length ? '<ul class="builder-items">' + b.items.map(function (it, i) {
        var f = FOOD_BY_ID[it.foodId];
        if (!f) return '';
        return '<li class="builder-item"><label for="bi-' + i + '" class="food-name">' + esc(f.name) + '</label>' +
          '<span class="inline-input"><input id="bi-' + i + '" type="number" inputmode="decimal" min="1" max="2000" value="' + esc(it.grams) + '" data-action="builder-grams" data-live="builder-grams" data-index="' + i + '"><span>' + esc(f.unit) + '</span></span>' +
          '<span class="entry-kcal">' + esc(fmtInt(f.kcal * it.grams / 100)) + ' kcal</span>' +
          '<button type="button" class="btn btn-icon btn-danger-ghost" data-action="builder-remove" data-index="' + i + '" aria-label="Remove ' + esc(f.name) + '">' + icon('trash') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted">No foods yet. Add some below or let the app suggest a balanced meal.</p>') +
      '<form class="inline-form" data-action="builder-add" novalidate><div class="field"><label for="builder-food">Food</label><select id="builder-food" name="foodId">' + foodOptions(b.diet) + '</select></div>' +
      field({ id: 'builder-grams-new', name: 'grams', label: 'Amount', suffix: 'g/ml', type: 'number', inputmode: 'decimal', min: 1, max: 2000, value: 100, error: e.grams }) +
      '<button type="submit" class="btn btn-secondary">' + icon('plus') + ' Add</button></form>' +
      '<div id="builder-totals" class="builder-totals" aria-live="polite">' + builderTotalsHTML(t) + '</div>' +
      '<div class="btn-row"><button type="button" class="btn btn-secondary" data-action="builder-suggest">Suggest balanced meal</button>' +
      '<button type="button" class="btn btn-primary" data-action="builder-save">' + (b.editingId ? 'Update saved meal' : 'Save meal') + '</button>' +
      '<button type="button" class="btn btn-ghost" data-action="builder-clear">Clear</button></div></section>' +
      '<section class="card" aria-labelledby="saved-title"><h2 id="saved-title">Saved meals</h2>' +
      (state.savedMeals.length ? '<ul class="saved-meals">' + state.savedMeals.map(function (sm) {
        return '<li class="saved-meal"><div><span class="food-name">' + esc(sm.name) + '</span><span class="food-meta">' + esc(fmtInt(itemsKcal(sm.items))) + ' kcal · ' + sm.items.length + ' items</span></div>' +
          '<div class="btn-row"><button type="button" class="btn btn-small btn-secondary" data-action="saved-add" data-id="' + esc(sm.id) + '">Add to diary</button>' +
          '<button type="button" class="btn btn-small btn-ghost" data-action="saved-load" data-id="' + esc(sm.id) + '">Load</button>' +
          '<button type="button" class="btn btn-small btn-ghost" data-action="saved-duplicate" data-id="' + esc(sm.id) + '">Duplicate</button>' +
          '<button type="button" class="btn btn-small btn-danger-ghost" data-action="saved-delete" data-id="' + esc(sm.id) + '">Delete<span class="visually-hidden"> ' + esc(sm.name) + '</span></button></div></li>';
      }).join('') + '</ul>' : '<p class="muted">Saved meals appear here.</p>') + '</section>';
  }

  function renderSavedAddDialog(meal, ctx) {
    return '<form method="dialog" data-action="saved-add-submit" data-id="' + esc(meal.id) + '" novalidate><h2 id="dialog-title">Add \u201c' + esc(meal.name) + '\u201d to the diary</h2>' +
      field({ id: 'sa-meal', name: 'meal', label: 'Meal', type: 'select', options: MEALS.map(function (k) { return [k, MEAL_LABELS[k]]; }), value: 'lunch' }) +
      field({ id: 'sa-date', name: 'date', label: 'Date', type: 'date', value: ctx.today }) +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="dialog-close">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div></form>';
  }

  function renderTemplates(state, ctx) {
    var w = [1, 2, 3, 4].indexOf(ctx.ui.planWeek) >= 0 ? ctx.ui.planWeek : 1;
    var d = Math.min(6, Math.max(0, ctx.ui.planDay | 0));
    var meta = TEMPLATE_META[w];
    var day = state.plans[w][d];
    var dayKcal = sum(MEALS.map(function (k) { return itemsKcal(day[k]); }));
    return '<section class="card" aria-labelledby="tpl-title"><h2 id="tpl-title">Weekly templates</h2>' +
      '<div class="tabs" role="group" aria-label="Week">' + [1, 2, 3, 4].map(function (n) {
        return '<button type="button" class="tab" data-action="plan-week" data-week="' + n + '" aria-pressed="' + (n === w ? 'true' : 'false') + '">Week ' + n + ': ' + esc(TEMPLATE_META[n].name) + '</button>';
      }).join('') + '</div>' +
      '<p><strong>' + esc(meta.name) + '</strong> · ' + esc(meta.range) + '</p><p class="muted">' + esc(meta.notes) + '</p>' +
      '<div class="tabs tabs-days" role="group" aria-label="Day">' + [0, 1, 2, 3, 4, 5, 6].map(function (n) {
        return '<button type="button" class="tab" data-action="plan-day" data-day="' + n + '" aria-pressed="' + (n === d ? 'true' : 'false') + '">Day ' + (n + 1) + '</button>';
      }).join('') + '</div>' +
      '<p class="big-stat"><span>Day ' + (d + 1) + ' total</span><strong>' + esc(fmtInt(dayKcal)) + ' kcal</strong></p>' +
      '<div class="plan-meals">' + MEALS.map(function (meal) {
        var items = day[meal];
        return '<div class="plan-meal"><h3>' + esc(MEAL_LABELS[meal]) + ' <span class="muted">' + esc(fmtInt(itemsKcal(items))) + ' kcal</span></h3>' +
          (items.length ? '<ul class="builder-items">' + items.map(function (it, i) {
            var f = FOOD_BY_ID[it.foodId];
            var id = 'pi-' + meal + '-' + i;
            return '<li class="builder-item"><label for="' + id + '" class="food-name">' + esc(f.name) + '</label><span class="inline-input"><input id="' + id + '" type="number" inputmode="decimal" min="1" max="2000" value="' + esc(it.grams) +
              '" data-action="plan-grams" data-meal="' + meal + '" data-index="' + i + '"><span>' + esc(f.unit) + '</span></span>' +
              '<button type="button" class="btn btn-icon btn-danger-ghost" data-action="plan-remove" data-meal="' + meal + '" data-index="' + i + '" aria-label="Remove ' + esc(f.name) + '">' + icon('trash') + '</button></li>';
          }).join('') + '</ul>' : '<p class="muted">Empty.</p>') +
          '<form class="inline-form compact" data-action="plan-add" data-meal="' + meal + '" novalidate><div class="field"><label for="pa-' + meal + '">Add food to ' + esc(MEAL_LABELS[meal].toLowerCase()) + '</label><select id="pa-' + meal + '" name="foodId">' + foodOptions(null) + '</select></div>' +
          '<div class="field field-narrow"><label for="pag-' + meal + '">Amount (g/ml)</label><input id="pag-' + meal + '" name="grams" type="number" inputmode="decimal" min="1" max="2000" value="100"></div>' +
          '<button type="submit" class="btn btn-secondary btn-small">Add</button></form>' +
          '<button type="button" class="btn btn-ghost btn-small" data-action="plan-log" data-meal="' + meal + '"' + (items.length ? '' : ' disabled') + '>Log to today\u2019s diary</button></div>';
      }).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost" data-action="plan-reset">Reset week ' + w + ' to the original template</button></section>';
  }

  function renderGroceries(state) {
    var g = state.groceries;
    return '<section class="card print-area" aria-labelledby="groc-title"><h2 id="groc-title">Grocery list</h2>' +
      '<form class="inline-form no-print" data-action="groceries-generate" novalidate>' +
      field({ id: 'groc-week', name: 'week', label: 'Week', type: 'select', options: [1, 2, 3, 4].map(function (n) { return [n, 'Week ' + n + ': ' + TEMPLATE_META[n].name]; }), value: g.week }) +
      field({ id: 'groc-household', name: 'household', label: 'People', type: 'number', inputmode: 'numeric', min: 1, max: 8, value: g.household }) +
      '<button type="submit" class="btn btn-primary">Generate list</button></form>' +
      '<p class="print-only">Week ' + g.week + ' · household of ' + g.household + '</p>' +
      (g.items.length ? AISLE_ORDER.map(function (aisle) {
        var items = g.items.filter(function (i) { return i.aisle === aisle; });
        if (!items.length) return '';
        return '<h3>' + esc(aisle) + '</h3><ul class="grocery-list">' + items.map(function (it) {
          return '<li class="grocery-item' + (it.checked ? ' is-checked' : '') + '"><label class="choice"><input type="checkbox" data-action="grocery-check" data-id="' + esc(it.id) + '"' + (it.checked ? ' checked' : '') + '> <span>' + esc(it.name) + '</span></label>' +
            '<span class="inline-input no-print"><label class="visually-hidden" for="gq-' + esc(it.id) + '">Quantity of ' + esc(it.name) + '</label><input id="gq-' + esc(it.id) + '" type="number" min="0" max="100000" value="' + esc(it.qty) + '" data-action="grocery-qty" data-id="' + esc(it.id) + '"><span>' + esc(it.unit) + '</span></span>' +
            '<span class="print-only">' + esc(fmtInt(it.qty)) + ' ' + esc(it.unit) + '</span>' + (it.custom ? '<span class="badge no-print">Custom</span>' : '') +
            '<button type="button" class="btn btn-icon btn-danger-ghost no-print" data-action="grocery-remove" data-id="' + esc(it.id) + '" aria-label="Remove ' + esc(it.name) + '">' + icon('trash') + '</button></li>';
        }).join('') + '</ul>';
      }).join('') : '<p class="muted">Generate a list from a weekly template. Custom items you add are kept when you regenerate.</p>') +
      '<form class="inline-form no-print" data-action="grocery-add" novalidate>' +
      field({ id: 'ga-name', name: 'name', label: 'Custom item', autocomplete: 'off' }) +
      field({ id: 'ga-qty', name: 'qty', label: 'Quantity', type: 'number', min: 0, max: 100000, className: 'field-narrow' }) +
      field({ id: 'ga-unit', name: 'unit', label: 'Unit', value: 'items', className: 'field-narrow' }) +
      field({ id: 'ga-aisle', name: 'aisle', label: 'Aisle', type: 'select', options: AISLE_ORDER.map(function (a) { return [a, a]; }), value: 'Other' }) +
      '<button type="submit" class="btn btn-secondary">Add item</button></form>' +
      '<div class="btn-row no-print"><button type="button" class="btn btn-ghost" data-action="groceries-print">Print list</button>' +
      '<button type="button" class="btn btn-ghost" data-action="groceries-export-text">' + icon('download') + ' Text file</button>' +
      '<button type="button" class="btn btn-ghost" data-action="groceries-export-json">' + icon('download') + ' JSON file</button></div></section>';
  }

  function renderPrep(state, ctx) {
    var p = state.prep;
    var info = missionInfo(state.mission.startDate, ctx.today);
    var week = info.status === 'unset' ? 1 : Math.min(4, Math.ceil(info.day / 7));
    return '<section class="card" aria-labelledby="prep-title"><h2 id="prep-title">Night-before checklist</h2>' +
      '<p class="muted">Tasks for week ' + week + (p.date ? ' · checklist for ' + esc(fmtDateLong(p.date)) : '') + '</p>' +
      (p.items.length ? '<ul class="checklist">' + p.items.map(function (it) {
        return '<li><label class="choice"><input type="checkbox" data-action="prep-check" data-id="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + '> <span>' + esc(it.text) + '</span></label>' +
          (it.custom ? '<button type="button" class="btn btn-icon btn-danger-ghost" data-action="prep-remove" data-id="' + esc(it.id) + '" aria-label="Remove task ' + esc(it.text) + '">' + icon('trash') + '</button>' : '') + '</li>';
      }).join('') + '</ul>' : '') +
      '<form class="inline-form" data-action="prep-add" novalidate>' + field({ id: 'prep-new', name: 'text', label: 'Add your own task', autocomplete: 'off', error: errs(ctx, 'prep').text }) +
      '<button type="submit" class="btn btn-secondary">Add task</button></form>' +
      field({ id: 'prep-notes', name: 'notes', label: 'Notes for tomorrow', type: 'textarea', value: p.notes, action: 'prep-notes', maxlength: 1000 }) +
      '<fieldset class="field"><legend>Local reminder</legend><p class="field-hint">A notification from this browser while the app is open. Off by default, nothing is sent to a server.</p>' +
      '<label class="choice"><input type="checkbox" data-action="prep-reminder-toggle"' + (p.reminder.enabled ? ' checked' : '') + '> Remind me each evening</label>' +
      '<div class="field field-narrow"><label for="prep-time">Time</label><input type="time" id="prep-time" value="' + esc(p.reminder.time) + '" data-action="prep-reminder-time"></div></fieldset>' +
      '<button type="button" class="btn btn-ghost" data-action="prep-reset">Reset checklist</button></section>';
  }

  function renderPlanner(state, ctx) {
    var tab = ['builder', 'templates', 'groceries', 'prep'].indexOf(ctx.ui.plannerTab) >= 0 ? ctx.ui.plannerTab : 'builder';
    var tabs = [['builder', 'Meal builder'], ['templates', 'Weekly templates'], ['groceries', 'Groceries'], ['prep', 'Preparation']];
    var body = tab === 'templates' ? renderTemplates(state, ctx) : tab === 'groceries' ? renderGroceries(state) : tab === 'prep' ? renderPrep(state, ctx) : renderBuilder(state, ctx);
    return viewTitle('Planner', 'Build meals, follow a weekly template, shop and prepare.') +
      '<div class="tabs no-print" role="group" aria-label="Planner sections">' + tabs.map(function (tb) {
        return '<button type="button" class="tab" data-action="planner-tab" data-tab="' + tb[0] + '" aria-pressed="' + (tab === tb[0] ? 'true' : 'false') + '">' + esc(tb[1]) + '</button>';
      }).join('') + '</div>' + body;
  }

  /* ------------------------------------------------------------------ */
  /* Views: training                                                     */
  /* ------------------------------------------------------------------ */

  function workoutFor(state, date) {
    if (state.workouts[date]) return { record: state.workouts[date], saved: true };
    var info = missionInfo(state.mission.startDate, date);
    var day = info.status === 'unset' ? 1 : info.day;
    return { record: buildSession(sessionTypeForDay(day), phaseForDay(day)), saved: false };
  }

  function renderTraining(state, ctx) {
    var date = isValidDate(ctx.ui.trainDate) ? ctx.ui.trainDate : ctx.today;
    var info = missionInfo(state.mission.startDate, date);
    var phase = info.status === 'unset' ? 1 : info.phase;
    var wf = workoutFor(state, date);
    var w = wf.record;
    var range = weekRangeFor(state, date);
    var stats = trainingStats(state.workouts, range.from, range.to);
    var hasSymptoms = w.symptoms.length > 0;
    var statusBadge = w.completed ? '<span class="badge badge-ok">' + icon('check') + 'Completed</span>' : w.stopped ? '<span class="badge badge-warn">Stopped early — recorded</span>' : '<span class="badge">' + (wf.saved ? 'In progress' : 'Planned') + '</span>';
    var dayLine = info.status === 'active' ? 'Mission day ' + info.day + ' · Phase ' + phase + ': ' + PHASES[phase].name + ' (days ' + PHASES[phase].days + ')' :
      info.status === 'before' ? 'Before your mission starts — showing the day 1 plan.' : info.status === 'after' ? 'After day 30 — showing the day 30 plan. Repeat any session you enjoyed.' : 'Set a mission start date in Settings to follow the plan.';
    var exRows = w.exercises.map(function (ex, i) {
      var meta = EXERCISES[ex.id];
      function num(fieldName, label, val, max, step) {
        return '<div class="field field-narrow"><label for="ex-' + i + '-' + fieldName + '">' + esc(label) + '</label><input id="ex-' + i + '-' + fieldName + '" type="number" inputmode="decimal" min="0" max="' + max + '" step="' + (step || 1) + '" value="' + esc(val) + '" data-action="workout-field" data-index="' + i + '" data-field="' + fieldName + '"></div>';
      }
      return '<li class="exercise"><h3>' + esc(ex.name) + '</h3>' +
        (meta ? '<details><summary>Technique</summary><ul>' + meta.cues.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul><p class="muted small">Easier: ' + esc(meta.easier) + ' · Harder: ' + esc(meta.harder) + '</p></details>' : '') +
        '<div class="exercise-fields">' + num('sets', 'Sets', ex.sets, 20) + num('reps', 'Reps', ex.reps, 200) + num('loadKg', 'Load (kg)', ex.loadKg, 500, '0.5') + num('durationSec', 'Time (s)', ex.durationSec, 7200) +
        '<div class="field field-grow"><label for="ex-' + i + '-notes">Notes</label><input id="ex-' + i + '-notes" type="text" maxlength="300" value="' + esc(ex.notes) + '" data-action="workout-field" data-index="' + i + '" data-field="notes"></div></div></li>';
    }).join('');
    var restText = w.type === 'rest' ? '<p>Rest day. A relaxed walk and 5–10 minutes of gentle mobility (hip circles, cat–cow, calf stretches) help recovery.</p>' : '';
    var aerobicText = w.type === 'aerobic' ? '<p>' + esc(PHASES[phase].aerobicMin) + ' minutes of brisk walking, cycling, swimming or similar at a pace where you can talk in short sentences.</p>' : '';
    return viewTitle('Training') + dateBar('train', date, ctx.today) +
      '<p class="mission-line">' + esc(dayLine) + '</p><p class="muted">' + esc(PHASES[phase].intensity) + '</p>' +
      '<section class="card" aria-labelledby="week-stats"><h2 id="week-stats">' + esc(range.label) + ' <span class="muted small">(' + esc(fmtDate(range.from)) + ' – ' + esc(fmtDate(range.to)) + ')</span></h2><div class="summary-grid">' +
      '<p class="big-stat"><span>Strength sessions</span><strong>' + stats.strength + ' / 3</strong></p>' +
      '<p class="big-stat"><span>Aerobic minutes</span><strong>' + esc(fmtInt(stats.aerobicMin)) + '</strong></p>' +
      '<p class="big-stat"><span>Core exposures</span><strong>' + stats.core + ' / 3</strong></p>' +
      '<p class="big-stat"><span>Stopped early</span><strong>' + stats.stopped + '</strong></p></div></section>' +
      '<section class="card session" aria-labelledby="session-title"><div class="meal-head"><h2 id="session-title">' + esc(w.title) + '</h2>' + statusBadge + '</div>' +
      '<p class="muted small">Changes save automatically on this device.</p>' + restText + aerobicText +
      (exRows ? '<ol class="exercises">' + exRows + '</ol>' : '') +
      '<div class="grid-2">' +
      field({ id: 'w-aerobic', name: 'aerobicMin', label: 'Aerobic minutes', type: 'number', inputmode: 'numeric', min: 0, max: 600, value: w.aerobicMin, action: 'workout-meta' }) +
      field({ id: 'w-difficulty', name: 'difficulty', label: 'How hard did it feel? (1–10)', type: 'select', placeholder: 'Not rated', options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return [n, String(n)]; }), value: w.difficulty, action: 'workout-meta' }) +
      '</div>' +
      '<fieldset class="field symptoms"><legend>Did you notice any warning symptoms?</legend>' + Object.keys(WARNING_SYMPTOMS).map(function (k) {
        return '<label class="choice"><input type="checkbox" data-action="workout-symptom" value="' + k + '"' + (w.symptoms.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(WARNING_SYMPTOMS[k]) + '</label>';
      }).join('') + '</fieldset>' +
      (hasSymptoms ? notice('danger', '<p><strong>Stop this session now.</strong> Rest, and seek medical help — call 999 or 112 if symptoms are severe or do not settle. Do not resume training until a clinician has advised you. You can save this session as stopped so your record stays honest.</p>', 'alert') : '') +
      field({ id: 'w-pain', name: 'painNote', label: 'Pain or discomfort notes', type: 'textarea', value: w.painNote, action: 'workout-meta', maxlength: 500 }) +
      field({ id: 'w-notes', name: 'notes', label: 'Session notes', type: 'textarea', value: w.notes, action: 'workout-meta', maxlength: 1000 }) +
      '<div class="btn-row">' +
      '<button type="button" class="btn btn-primary" data-action="workout-complete"' + (hasSymptoms ? ' disabled aria-describedby="complete-blocked"' : '') + '>' + icon('check') + ' Mark complete</button>' +
      '<button type="button" class="btn btn-secondary" data-action="workout-stop">' + icon('stop') + ' Save as stopped</button>' +
      (w.type !== 'minimum' ? '<button type="button" class="btn btn-ghost" data-action="workout-minimum">Swap for 12-minute minimum</button>' : '') +
      (wf.saved ? '<button type="button" class="btn btn-ghost" data-action="workout-reset">Reset to plan</button>' : '') + '</div>' +
      (hasSymptoms ? '<p class="field-error" id="complete-blocked">Completion is blocked while a warning symptom is selected.</p>' : '') + '</section>' +
      '<section class="card" aria-labelledby="plan30"><h2 id="plan30">30-day plan</h2><ol class="plan-grid">' +
      Array.apply(null, { length: MISSION_DAYS }).map(function (_, i) {
        var dn = i + 1, type = sessionTypeForDay(dn);
        var d = state.mission.startDate ? addDays(state.mission.startDate, i) : null;
        var rec = d && state.workouts[d];
        var current = info.status === 'active' && info.day === dn;
        return '<li class="plan-cell type-' + type + (current ? ' is-current' : '') + '">' + (d ? '<button type="button" data-action="train-go" data-date="' + esc(d) + '"' + (current ? ' aria-current="date"' : '') + '>' : '<span>') +
          '<span class="plan-day">Day ' + dn + '</span><span class="plan-type">' + esc(WORKOUT_TITLES[type].replace(' + core', '')) + '</span>' +
          (rec ? '<span class="plan-status">' + (rec.completed ? '✓ done' : rec.stopped ? 'stopped' : 'started') + '</span>' : '') + (d ? '</button>' : '</span>') + '</li>';
      }).join('') + '</ol><p class="muted small">Each week: three strength sessions with core work, two aerobic sessions and two rest days. Training improves fitness and health; it does not target fat from a specific area.</p></section>' +
      '<section class="card" aria-labelledby="wger-title"><h2 id="wger-title">Find more exercises</h2>' +
      '<form class="inline-form" data-action="wger-search" role="search" novalidate>' + field({ id: 'wger-q', name: 'q', label: 'Search the wger exercise database', type: 'search', value: (ctx.ui.wger && ctx.ui.wger.query) || '', hint: 'Needs a connection. Your search words go to the site\u2019s server, which asks wger.de.' }) +
      '<button type="submit" class="btn btn-secondary">Search</button></form><div role="status" aria-live="polite" class="api-status">' + (ctx.ui.wger.status === 'loading' ? 'Searching…' : esc(ctx.ui.wger.message || '')) + '</div>' +
      (ctx.ui.wger.results && ctx.ui.wger.results.length ? '<ul class="wger-results">' + ctx.ui.wger.results.map(function (r) {
        var img = safeImageUrl(r.image);
        return '<li class="product-card">' + (img ? '<img src="' + esc(img) + '" alt="" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">' : '') + '<div><p class="food-name">' + esc(r.name) + '</p><p class="food-meta">' + esc(r.category || '') + '</p>' +
          (r.description ? '<p class="small">' + esc(r.description) + '</p>' : '') + '</div></li>';
      }).join('') + '</ul><p class="attribution">Exercise data from wger.de, licensed CC BY-SA 4.0.</p>' : '') +
      '<h3>Built-in technique library</h3><div class="technique-list">' + Object.keys(EXERCISES).map(function (id) {
        var ex = EXERCISES[id];
        return '<details><summary>' + esc(ex.name) + '</summary><ul>' + ex.cues.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul><p class="muted small">Easier: ' + esc(ex.easier) + ' · Harder: ' + esc(ex.harder) + '</p></details>';
      }).join('') + '</div></section>';
  }

  /* ------------------------------------------------------------------ */
  /* Views: progress                                                     */
  /* ------------------------------------------------------------------ */

  function progressRange(state, today) {
    var info = missionInfo(state.mission.startDate, today);
    if (info.status === 'active' || info.status === 'after') return { from: info.startDate, to: info.endDate, label: 'Mission: ' + fmtDate(info.startDate) + ' – ' + fmtDate(info.endDate, true) };
    return { from: addDays(today, -29), to: today, label: 'Last 30 days' };
  }

  function renderProgress(state, ctx) {
    var hd = isValidDate(ctx.ui.healthDate) ? ctx.ui.healthDate : ctx.today;
    var h = draft(ctx, 'health') || state.health[hd] || {};
    var e = errs(ctx, 'health');
    var range = progressRange(state, ctx.today);
    var dates = dateRange(range.from, range.to);
    var st = progressStats(state, range.from, range.to);
    function pts(fn) { return dates.map(function (d) { return { date: d, value: fn(d) }; }); }
    var weight = pts(function (d) { var v = (state.health[d] || {}).weightKg; return Number.isFinite(v) ? v : null; });
    var firstW = weight.filter(function (p) { return Number.isFinite(p.value); })[0];
    var kcal = pts(function (d) { return (state.diary[d] || []).length ? dayTotals(state.diary[d]).kcal : null; });
    var protein = pts(function (d) { return (state.diary[d] || []).length ? dayTotals(state.diary[d]).protein : null; });
    var steps = pts(function (d) { var v = (state.health[d] || {}).steps; return Number.isFinite(v) ? v : null; });
    var sleep = pts(function (d) { var v = (state.health[d] || {}).sleepMin; return Number.isFinite(v) ? round1(v / 60) : null; });
    var waist = pts(function (d) { var v = (state.health[d] || {}).waistCm; return Number.isFinite(v) ? v : null; });
    var weeks = [];
    for (var i = 0; i < dates.length; i += 7) {
      var to = dates[Math.min(dates.length - 1, i + 6)];
      weeks.push({ date: dates[i], label: 'Week from ' + fmtDate(dates[i]), value: diffDays(dates[i], ctx.today) < 0 ? null : trainingStats(state.workouts, dates[i], to).completed });
    }
    function avgText(v, unit, dec) { return v === null ? '—' : (dec ? fmt1(v) : fmtInt(v)) + (unit ? ' ' + unit : ''); }
    return viewTitle('Progress', esc(range.label)) +
      '<section class="card" aria-labelledby="checkin-title"><h2 id="checkin-title">Health check-in</h2>' +
      '<form data-action="health-submit" novalidate>' +
      field({ id: 'h-date', name: 'date', label: 'Date', type: 'date', value: hd, action: 'health-date' }) +
      '<div class="grid-4">' +
      field({ id: 'h-weightKg', name: 'weightKg', label: 'Weight', suffix: 'kg', type: 'number', inputmode: 'decimal', step: '0.1', min: 30, max: 300, value: h.weightKg, error: e.weightKg }) +
      field({ id: 'h-waistCm', name: 'waistCm', label: 'Waist', suffix: 'cm', type: 'number', inputmode: 'decimal', step: '0.1', min: 40, max: 200, value: h.waistCm, error: e.waistCm }) +
      field({ id: 'h-steps', name: 'steps', label: 'Steps', type: 'number', inputmode: 'numeric', min: 0, max: 100000, value: h.steps, error: e.steps }) +
      field({ id: 'h-sleepHours', name: 'sleepHours', label: 'Sleep', suffix: 'hours', type: 'number', inputmode: 'decimal', step: '0.25', min: 0, max: 16, value: h.sleepHours !== undefined ? h.sleepHours : (Number.isFinite(h.sleepMin) ? round1(h.sleepMin / 60) : ''), error: e.sleepHours }) +
      field({ id: 'h-waterMl', name: 'waterMl', label: 'Water', suffix: 'ml', type: 'number', inputmode: 'numeric', min: 0, max: 10000, value: h.waterMl, error: e.waterMl }) +
      field({ id: 'h-hunger', name: 'hunger', label: 'Hunger (1 low – 5 high)', type: 'select', placeholder: 'Not rated', options: [1, 2, 3, 4, 5].map(function (n) { return [n, String(n)]; }), value: h.hunger, error: e.hunger }) +
      field({ id: 'h-energy', name: 'energy', label: 'Energy (1 low – 5 high)', type: 'select', placeholder: 'Not rated', options: [1, 2, 3, 4, 5].map(function (n) { return [n, String(n)]; }), value: h.energy, error: e.energy }) +
      '</div>' + field({ id: 'h-notes', name: 'notes', label: 'Notes', type: 'textarea', value: h.notes, maxlength: 500 }) +
      '<button type="submit" class="btn btn-primary">Save check-in</button></form></section>' +
      '<section class="card" aria-labelledby="stats-title"><h2 id="stats-title">Summary</h2><dl class="stats">' +
      [['Habit adherence', st.adherencePct + '%'], ['Days with food logged', st.daysLogged + ' of ' + st.days], ['Average intake', avgText(st.avgKcal, 'kcal') + ' (target ' + fmtInt(state.targets.kcal) + ')'],
        ['Average protein', avgText(st.avgProtein, 'g')], ['Average steps', avgText(st.avgSteps, '')], ['Average sleep', st.avgSleep === null ? '—' : fmtDuration(st.avgSleep)],
        ['Workouts completed', String(st.workoutsCompleted)], ['Sessions stopped early', String(st.workoutsStopped)], ['Strength sessions', String(st.strengthSessions)], ['Aerobic minutes', fmtInt(st.aerobicMin)],
        ['Measured weight change', st.weightChange === null ? 'Needs two weigh-ins' : (st.weightChange > 0 ? '+' : '') + fmt1(st.weightChange) + ' kg'],
        ['Measured waist change', st.waistChange === null ? 'Needs two measurements' : (st.waistChange > 0 ? '+' : '') + fmt1(st.waistChange) + ' cm']].map(function (r) {
        return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
      }).join('') + '</dl><p class="muted small">These are measurements, not predictions. Day-to-day weight moves with water, salt and digestion, so the seven-day average is the better guide.</p></section>' +
      '<div class="chart-grid">' +
      '<section class="card" aria-labelledby="c-weight"><h2 id="c-weight">Weight</h2>' + lineChart({ id: 'ch-weight', title: 'Weight', unit: 'kg', decimals: true, points: weight, avg: rollingAverage(weight, 7), target: firstW ? round1(firstW.value - 3) : null, targetLabel: 'Upper target: 3 kg below first weigh-in' }) + '</section>' +
      '<section class="card" aria-labelledby="c-kcal"><h2 id="c-kcal">Calories against target</h2>' + barChart({ id: 'ch-kcal', title: 'Calories', unit: 'kcal', points: kcal, target: state.targets.kcal, overIsWarning: true }) + '</section>' +
      '<section class="card" aria-labelledby="c-protein"><h2 id="c-protein">Protein</h2>' + barChart({ id: 'ch-protein', title: 'Protein', unit: 'g', points: protein, target: state.targets.protein }) + '</section>' +
      '<section class="card" aria-labelledby="c-steps"><h2 id="c-steps">Steps</h2>' + barChart({ id: 'ch-steps', title: 'Steps', unit: 'steps', points: steps, target: state.targets.steps }) + '</section>' +
      '<section class="card" aria-labelledby="c-sleep"><h2 id="c-sleep">Sleep</h2>' + barChart({ id: 'ch-sleep', title: 'Sleep', unit: 'hours', decimals: true, points: sleep, target: round1(state.targets.sleepMin / 60) }) + '</section>' +
      '<section class="card" aria-labelledby="c-waist"><h2 id="c-waist">Waist</h2>' + lineChart({ id: 'ch-waist', title: 'Waist', unit: 'cm', decimals: true, points: waist }) + '</section>' +
      '<section class="card" aria-labelledby="c-workouts"><h2 id="c-workouts">Workout frequency</h2>' + barChart({ id: 'ch-workouts', title: 'Workouts completed', unit: 'sessions', firstHeader: 'Week', points: weeks }) + '</section>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Views: learn                                                        */
  /* ------------------------------------------------------------------ */

  function renderLearn() {
    return viewTitle('Learn', 'How Fit30 Reset works, and how to use it safely.') + safetyNotice() +
      '<div class="prose">' +
      '<section class="card"><h2>Realistic expectations</h2><p>Up to 3 kg in 30 days is an ambitious upper target, not a promise. Early weight change includes water and stored carbohydrate; fat loss is slower and uneven. A smaller waist, more strength, steadier energy and habits you keep are all real progress.</p><p>No exercise burns fat from one particular area. Training builds strength and fitness across the whole body.</p></section>' +
      '<section class="card"><h2>How your targets are calculated</h2><p>Resting energy uses the Mifflin–St Jeor equation: 10 × weight (kg) + 6.25 × height (cm) − 5 × age, then + 5 for men or − 161 for women. That figure is multiplied by an activity factor (1.2 to 1.725) to estimate maintenance. Your chosen pace subtracts about 300, 500 or 700 kcal.</p><p>The software never sets a target above maintenance or below 1,200 kcal (women) or 1,500 kcal (men). Protein is set at about 1.4 g per kg of current weight; fat at about 28% of energy; carbohydrate fills the rest. These are population estimates, so adjust them after two weeks if your weight and hunger suggest it.</p></section>' +
      '<section class="card"><h2>Plate basics</h2><ul><li>Half the plate vegetables or salad</li><li>A palm-sized protein portion at each meal</li><li>A cupped-hand portion of whole grains or potatoes</li><li>A thumb of oil, nuts, seeds or cheese</li></ul></section>' +
      '<section class="card"><h2>Training basics</h2><p>Three short strength sessions, two aerobic sessions and daily walking. Start lighter than you think, keep two or three repetitions in reserve, and progress in small steps each week. If you are short of time, the 12-minute minimum keeps the habit going.</p></section>' +
      '<section class="card"><h2>Sleep, steps and stress</h2><p>Seven to nine hours of sleep helps appetite control and recovery. Steps add up: a 10-minute walk after meals is an easy win. Notice hunger and energy in your check-ins — they tell you whether the plan is sustainable.</p></section>' +
      '<section class="card"><h2>Your data</h2><p>Everything is stored in this browser. Nothing is sent anywhere unless you search online, scan a barcode, look up exercises, or turn on optional Google sync. You can export, import and delete your data in Settings. See the <a href="privacy.html">privacy notice</a> and <a href="terms.html">terms</a>.</p></section>' +
      '<section class="card"><h2>Sources and licences</h2><ul><li>Offline food values: typical averages compiled for this app.</li><li>Online food search: USDA FoodData Central (public domain).</li><li>Barcodes: Open Food Facts (ODbL), crowd-sourced.</li><li>Exercise search: wger.de (CC BY-SA 4.0).</li></ul></section>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Views: settings and account                                         */
  /* ------------------------------------------------------------------ */

  function accountStatusText(a) {
    if (!a || a.status === 'disabled') return 'Accounts are not configured on this site. Everything stays on this device.';
    if (a.status === 'loading') return 'Checking account status…';
    if (a.status === 'signed-in') return 'Signed in as ' + (a.user && (a.user.name || a.user.email) || 'your Google account') + '. Sync is ' + (a.syncEnabled ? 'on' : 'off') + '.';
    return 'Not signed in. Your data stays on this device; you can sign in with Google to sync between devices.';
  }

  function renderSettings(state, ctx) {
    var e = errs(ctx, 'profile'), te = errs(ctx, 'targets'), se = errs(ctx, 'split'), me = errs(ctx, 'mission');
    var t = draft(ctx, 'targets') || state.targets;
    var floor = FLOORS[state.profile.sex] || 1200;
    var calc = calcTargets(state.profile);
    var floorNote = floorExplanation(calc);
    var split = draft(ctx, 'split') || state.mealSplit;
    var splitTotal = sum(MEALS.map(function (k) { return toNumber(split[k]); }));
    return viewTitle('Settings') +
      '<section class="card" aria-labelledby="set-profile"><h2 id="set-profile">Profile</h2><form data-action="profile-submit" novalidate>' + profileFields('set', draft(ctx, 'profile') || state.profile, e) +
      '<button type="submit" class="btn btn-primary">Save and recalculate targets</button></form>' +
      (calc.ok ? '<p class="muted small">Estimated resting energy ' + esc(fmtInt(calc.bmr)) + ' kcal · maintenance ' + esc(fmtInt(calc.maintenance)) + ' kcal · calculated target ' + esc(fmtInt(calc.kcal)) + ' kcal.</p>' : '') +
      (floorNote ? notice('info', '<p>' + esc(floorNote) + '</p>') : '') + '</section>' +
      '<section class="card" aria-labelledby="set-targets"><h2 id="set-targets">Daily targets</h2><p class="muted">Source: ' + esc(state.targets.source === 'manual' ? 'set by you' : state.targets.source === 'calculated' ? 'calculated from your profile' : 'defaults') + '.</p>' +
      (state.targets.kcal < floor ? notice('warning', '<p>Your calorie target (' + esc(fmtInt(state.targets.kcal)) + ' kcal) is below the ' + esc(fmtInt(floor)) + ' kcal software floor. Very low intakes are harder to sustain and should be supervised by a clinician.</p>', 'status') : '') +
      '<form data-action="targets-submit" novalidate><div class="grid-4">' +
      field({ id: 't-kcal', name: 'kcal', label: 'Calories', suffix: 'kcal', type: 'number', inputmode: 'numeric', value: t.kcal, error: te.kcal }) +
      field({ id: 't-protein', name: 'protein', label: 'Protein', suffix: 'g', type: 'number', inputmode: 'numeric', value: t.protein, error: te.protein }) +
      field({ id: 't-carbs', name: 'carbs', label: 'Carbohydrate', suffix: 'g', type: 'number', inputmode: 'numeric', value: t.carbs, error: te.carbs }) +
      field({ id: 't-fat', name: 'fat', label: 'Fat', suffix: 'g', type: 'number', inputmode: 'numeric', value: t.fat, error: te.fat }) +
      field({ id: 't-waterMl', name: 'waterMl', label: 'Water', suffix: 'ml', type: 'number', inputmode: 'numeric', value: t.waterMl, error: te.waterMl }) +
      field({ id: 't-steps', name: 'steps', label: 'Steps', type: 'number', inputmode: 'numeric', value: t.steps, error: te.steps }) +
      field({ id: 't-sleepMin', name: 'sleepMin', label: 'Sleep', suffix: 'minutes', type: 'number', inputmode: 'numeric', value: t.sleepMin, error: te.sleepMin }) +
      '</div><div class="btn-row"><button type="submit" class="btn btn-primary">Save targets</button><button type="button" class="btn btn-ghost" data-action="targets-recalculate">Recalculate from profile</button></div></form></section>' +
      '<section class="card" aria-labelledby="set-split"><h2 id="set-split">Meal split</h2><form data-action="split-submit" novalidate><div class="grid-4">' +
      MEALS.map(function (k) { return field({ id: 'split-' + k, name: k, label: MEAL_LABELS[k], suffix: '%', type: 'number', inputmode: 'numeric', min: 0, max: 100, value: split[k], error: se[k] }); }).join('') +
      '</div>' + (se.total ? '<p class="field-error" id="split-total-error" role="alert">' + esc(se.total) + '</p>' : '<p class="muted small">Total: ' + esc(Number.isFinite(splitTotal) ? splitTotal : 0) + '%</p>') +
      '<button type="submit" class="btn btn-primary">Save meal split</button></form></section>' +
      '<section class="card" aria-labelledby="set-mission"><h2 id="set-mission">Mission</h2><form class="inline-form" data-action="mission-submit" novalidate>' +
      field({ id: 'mission-start', name: 'startDate', label: 'Day 1 date', type: 'date', value: state.mission.startDate || ctx.today, error: me.startDate }) +
      '<button type="submit" class="btn btn-secondary">Save start date</button></form></section>' +
      '<section class="card" aria-labelledby="set-theme"><h2 id="set-theme">Appearance</h2><fieldset class="field"><legend>Theme</legend><div class="choice-row">' +
      THEMES.map(function (th) { return '<label class="choice"><input type="radio" name="theme" value="' + th + '" data-action="theme-set"' + (state.ui.theme === th ? ' checked' : '') + '> ' + (th === 'system' ? 'Match system' : th === 'light' ? 'Light' : 'Dark') + '</label>'; }).join('') +
      '</div></fieldset></section>' +
      '<section class="card" aria-labelledby="set-account"><h2 id="set-account">Account and sync</h2><p id="settings-account-status">' + esc(accountStatusText(ctx.account)) + '</p>' +
      '<button type="button" class="btn btn-secondary" data-action="account-open">Open account and sync</button></section>' +
      '<section class="card" aria-labelledby="set-data"><h2 id="set-data">Your data</h2><p>Stored in this browser under <code>' + STORAGE_KEY + '</code>. Export a backup regularly.</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-secondary" data-action="data-export">' + icon('download') + ' Export JSON backup</button>' +
      '<label class="btn btn-secondary file-btn">Import backup<input type="file" accept="application/json,.json" data-action="data-import" class="visually-hidden-file"></label>' +
      '<button type="button" class="btn btn-danger" data-action="data-reset">Reset all data</button></div>' +
      (ctx.ui.importError ? '<p class="field-error" role="alert">' + esc(ctx.ui.importError) + '</p>' : '') +
      '<p class="muted small"><a href="privacy.html">Privacy notice</a> · <a href="terms.html">Terms of use</a></p></section>';
  }

  function renderAccountButton(a) {
    var signedIn = a && a.status === 'signed-in';
    var name = signedIn ? (a.user && (a.user.name || a.user.email)) || 'Account' : 'Sign in';
    var initial = signedIn ? (name.trim().charAt(0) || '?').toUpperCase() : '';
    return '<span class="avatar' + (signedIn ? ' is-signed-in' : '') + '" aria-hidden="true">' + (initial ? esc(initial) : '<svg class="icon" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg>') + '</span>' +
      '<span class="account-label">' + esc(name) + '</span>';
  }

  function renderAccountDialog(a) {
    var s = a || { status: 'disabled' };
    var head = '<h2 id="dialog-title">Account and sync</h2>';
    var close = '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="dialog-close">Close</button></div>';
    var err = s.error ? '<p class="field-error" role="alert">' + esc(s.error) + '</p>' : '';
    if (s.status === 'loading') return head + '<p role="status">Checking account status…</p>' + close;
    if (s.status === 'disabled' || !s.status) {
      return head + '<div class="account-state" data-state="disabled"><p>' + esc(s.message || 'Accounts are not configured on this site.') + '</p>' +
        '<p>Everything keeps working without an account. Your data stays in this browser, and you can move it with export and import in Settings.</p>' +
        '<p class="muted small">Site operators: set <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in Netlify and redeploy. See the README.</p></div>' + err + close;
    }
    if (s.status === 'signed-out') {
      return head + '<div class="account-state" data-state="signed-out"><p><strong>No account required.</strong> Sign in only if you want one copy of your data on several devices.</p>' +
        '<p>What syncs: your profile, targets, diary, plans, groceries, preparation list, health check-ins and workouts, as one record.</p>' +
        '<p class="muted small">Your Google name and email are used to identify the account. The record is stored by Supabase for this site and is never used for advertising. See the <a href="privacy.html">privacy notice</a>.</p>' +
        '<button type="button" class="btn btn-primary" data-action="account-sign-in">Continue with Google</button></div>' + err + close;
    }
    var u = s.user || {};
    return head + '<div class="account-state" data-state="signed-in"><p class="account-identity">' + renderAccountButton(s) + '</p>' +
      (u.email ? '<p class="muted">' + esc(u.email) + '</p>' : '') +
      '<p>Sync is <strong>' + (s.syncEnabled ? 'on' : 'off') + '</strong>. Last upload: ' + esc(fmtTimestamp(s.lastUpload)) + '.</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-secondary" data-action="account-sync-toggle">' + (s.syncEnabled ? 'Turn sync off' : 'Turn sync on') + '</button>' +
      '<button type="button" class="btn btn-secondary" data-action="account-sync-now"' + (s.busy ? ' disabled' : '') + '>Sync now</button>' +
      '<button type="button" class="btn btn-ghost" data-action="account-sign-out">Sign out</button></div>' +
      '<div class="btn-row"><button type="button" class="btn btn-ghost" data-action="account-restore">Restore from cloud</button>' +
      '<button type="button" class="btn btn-ghost" data-action="account-replace-cloud">Replace cloud copy</button></div>' +
      '<p class="muted small">Sync is last-write-wins: the most recent upload replaces the cloud copy. There is no merging.</p>' +
      '<details class="danger-zone"><summary>Danger zone</summary><p>Deleting the cloud copy keeps the data on this device. Deleting the account also removes your sign-in and signs you out.</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-danger" data-action="account-delete-cloud">Delete cloud copy</button>' +
      '<button type="button" class="btn btn-danger" data-action="account-delete-account">Delete account</button></div></details></div>' + err + close;
  }

  function renderMergePrompt(kind) {
    var head = '<h2 id="dialog-title">' + (kind === 'both' ? 'You have data here and in the cloud' : kind === 'restore' ? 'Restore your cloud copy?' : 'Upload this device\u2019s data?') + '</h2>';
    if (kind === 'restore') return head + '<p>This device is empty and your account has a saved copy. Restore it here and turn sync on?</p>' +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="merge-dismiss">Not now (sync stays off)</button><button type="button" class="btn btn-primary" data-action="merge-use-cloud">Restore cloud copy</button></div>';
    if (kind === 'upload') return head + '<p>Your account has no saved copy yet. Upload the data on this device and turn sync on?</p>' +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="merge-dismiss">Not now (sync stays off)</button><button type="button" class="btn btn-primary" data-action="merge-keep-device">Upload and turn sync on</button></div>';
    return head + '<p>Nothing will be merged automatically. Choose which copy to keep:</p><ul class="merge-options">' +
      '<li><button type="button" class="btn btn-secondary" data-action="merge-keep-device">Keep this device</button><span>Replace the cloud copy with this device\u2019s data.</span></li>' +
      '<li><button type="button" class="btn btn-secondary" data-action="merge-use-cloud">Use cloud copy</button><span>Replace this device\u2019s data with the cloud copy.</span></li>' +
      '<li><button type="button" class="btn btn-secondary" data-action="merge-keep-both">Keep both</button><span>Download a backup of this device first, then restore the cloud copy.</span></li></ul>' +
      '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="merge-dismiss">Decide later (sync stays off)</button></div>';
  }

  var VIEWS = { dashboard: renderDashboard, food: renderFood, planner: renderPlanner, training: renderTraining, progress: renderProgress, learn: renderLearn, settings: renderSettings };
  function renderView(route, state, ctx) { return (VIEWS[route] || renderDashboard)(state, ctx || makeContext()); }

  /* ------------------------------------------------------------------ */
  /* Browser layer                                                       */
  /* ------------------------------------------------------------------ */

  var S = null;
  var CTX = null;
  var lastRoute = null;
  var lastFocus = null;
  var dialogKind = null;
  var pendingFood = null;
  var cloudCandidate = null;
  var confirmResolve = null;
  var cameraStream = null;
  var cameraTimer = null;
  var reminderTimer = null;

  function $(sel, rootEl) { return (rootEl || document).querySelector(sel); }
  function account() { return typeof window !== 'undefined' && window.Fit30Account ? window.Fit30Account : null; }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return normaliseState(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return defaultState();
    }
  }

  function persist(opts) {
    S.meta.lastSaved = new Date().toISOString();
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
    catch (e) { toast('Could not save on this device. Storage may be full or blocked.'); }
    var acc = account();
    if (acc && !(opts && opts.skipSync)) acc.queuePush();
  }

  function currentRoute() {
    var h = (window.location.hash || '').replace(/^#/, '');
    return ROUTES.indexOf(h) >= 0 ? h : 'dashboard';
  }

  function applyTheme() { document.documentElement.setAttribute('data-theme', S.ui.theme); }

  function render(opts) {
    opts = opts || {};
    var root = $('#view-root');
    if (!root) return;
    var route = currentRoute();
    var routeChanged = route !== lastRoute;
    var active = document.activeElement;
    var focusId = opts.focusId || (!routeChanged && active && active.id && root.contains(active) ? active.id : null);
    var scrollY = window.scrollY;
    if (route === 'planner' && CTX.ui.plannerTab === 'prep') ensurePrep();
    root.innerHTML = renderView(route, S, CTX);
    lastRoute = route;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = (S.profile.onboarded || route !== 'dashboard' ? ROUTE_TITLES[route] + ' · ' : '') + 'Fit30 Reset';
    if (routeChanged || opts.focusTitle) {
      window.scrollTo(0, 0);
      var title = $('#view-title', root) || $('#hero-title', root);
      if (title && !opts.initial) title.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, scrollY);
      if (focusId) {
        var el = document.getElementById(focusId);
        if (el) el.focus({ preventScroll: true });
      }
    }
    if (opts.focusInvalid) focusFirstInvalid(root);
  }

  function focusFirstInvalid(rootEl) {
    var el = $('[aria-invalid="true"]', rootEl) || $('.field-error[role="alert"]', rootEl);
    if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }
  }

  function setErrors(form, errors, data) {
    CTX.ui.errors[form] = errors || {};
    if (data) CTX.ui.drafts[form] = data; else delete CTX.ui.drafts[form];
  }
  function clearErrors(form) { delete CTX.ui.errors[form]; delete CTX.ui.drafts[form]; }

  function formData(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { out[k] = typeof v === 'string' ? v : ''; });
    return out;
  }

  function toast(message) {
    var region = $('#toast-region');
    if (!region) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    region.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* Dialogs */
  function openDialog(html, kind) {
    var d = $('#app-dialog');
    if (!d.open) lastFocus = document.activeElement;
    d.innerHTML = '<div class="dialog-body">' + html + '</div>';
    d.setAttribute('aria-labelledby', 'dialog-title');
    dialogKind = kind || 'generic';
    if (!d.open) d.showModal();
    var first = $('input:not([type="hidden"]), select, textarea', d) || $('.btn-primary', d) || $('button', d);
    if (first) first.focus();
  }
  function closeDialog() { var d = $('#app-dialog'); if (d && d.open) d.close(); }
  function refreshAccountDialog() {
    var d = $('#app-dialog');
    if (d && d.open && dialogKind === 'account') {
      var activeId = document.activeElement && document.activeElement.getAttribute('data-action');
      $('.dialog-body', d).innerHTML = renderAccountDialog(CTX.account);
      var again = activeId && $('[data-action="' + activeId + '"]', d);
      (again || $('button', d)).focus();
    }
  }

  function confirmAction(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var d = $('#confirm-dialog');
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      d.innerHTML = '<div class="dialog-body"><h2 id="confirm-title">' + esc(opts.title || 'Are you sure?') + '</h2><p>' + esc(message) + '</p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="confirm-no">Cancel</button>' +
        '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-yes">' + esc(opts.confirmLabel || 'Confirm') + '</button></div></div>';
      d.setAttribute('aria-labelledby', 'confirm-title');
      d.dataset.opener = '';
      d._opener = document.activeElement;
      d.returnValue = '';
      d.showModal();
      $('[data-action="confirm-no"]', d).focus();
    });
  }
  function finishConfirm(yes) {
    var d = $('#confirm-dialog');
    d.returnValue = yes ? 'yes' : 'no';
    if (d.open) d.close();
  }

  /* Prep checklist */
  function prepWeek() {
    var info = missionInfo(S.mission.startDate, CTX.today);
    return info.status === 'unset' ? 1 : Math.min(4, Math.ceil(info.day / 7));
  }
  function freshPrepItems() { return PREP_TASKS[prepWeek()].map(function (text, i) { return { id: 'p-t' + i, text: text, done: false, custom: false }; }); }
  function ensurePrep() {
    if (!S.prep.items.length && !S.prep.date) { S.prep.items = freshPrepItems(); S.prep.date = addDays(CTX.today, 1); persist(); }
  }

  function startReminderLoop() {
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = setInterval(function () {
      var r = S.prep.reminder;
      if (!r.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      var now = new Date();
      var hhmm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      var today = todayISO(now);
      if (hhmm >= r.time && r.lastNotified !== today) {
        try { new Notification('Fit30 Reset', { body: 'Time for your night-before checklist.', icon: 'icons/icon-192.png' }); } catch (e) { /* notifications unsupported */ }
        r.lastNotified = today;
        persist();
      }
    }, 30000);
  }

  /* Diary helpers */
  function addEntry(date, entry) {
    if (!entry) return false;
    var list = S.diary[date] || [];
    if (list.length >= CAPS.entries) { toast('This day already has the maximum of ' + CAPS.entries + ' entries.'); return false; }
    list.push(entry);
    S.diary[date] = list;
    return true;
  }
  function findEntry(id) {
    var list = S.diary[CTX.ui.foodDate] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return { list: list, index: i, entry: list[i] };
    return null;
  }
  function logItems(items, meal, date, source) {
    var added = 0;
    items.forEach(function (it) {
      var f = FOOD_BY_ID[it.foodId];
      if (!f) return;
      var e = normaliseEntry({ meal: meal, foodId: f.id, name: f.name, source: source || 'library', grams: it.grams, unit: f.unit, per100: f, createdAt: new Date().toISOString() });
      if (addEntry(date, e)) added++;
    });
    return added;
  }

  function shiftDate(key, delta) {
    var cur = isValidDate(CTX.ui[key]) ? CTX.ui[key] : CTX.today;
    CTX.ui[key] = delta === 0 ? CTX.today : addDays(cur, delta);
  }

  /* Network */
  function fetchJSON(url, opts, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 12000) : null;
    var o = opts || {};
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        return { status: res.status, ok: res.ok, data: data };
      });
    }).catch(function () {
      return { status: 0, ok: false, data: null, offline: true };
    }).then(function (r) { if (timer) clearTimeout(timer); return r; });
  }
  function offlineMessage(what) {
    return (typeof navigator !== 'undefined' && navigator.onLine === false ? 'You appear to be offline. ' : 'The ' + what + ' service could not be reached. ') + 'The offline food library and the rest of the app still work.';
  }

  function usdaSearch(q) {
    var query = cleanText(q, 80);
    CTX.ui.usda = { status: 'loading', message: '', results: [], query: query };
    if (query.length < 2) { CTX.ui.usda = { status: 'error', message: 'Enter at least two characters.', results: [], query: query }; render({ focusId: 'usda-q' }); return Promise.resolve(); }
    render({ focusId: 'usda-q' });
    return fetchJSON('/.netlify/functions/food-search?q=' + encodeURIComponent(query)).then(function (r) {
      var d = r.data || {};
      if (r.offline) CTX.ui.usda = { status: 'error', message: offlineMessage('food search'), results: [], query: query };
      else if (d.error) CTX.ui.usda = { status: 'error', message: cleanText(d.message, 300) || 'Online search is unavailable.', results: [], query: query };
      else if (!r.ok) CTX.ui.usda = { status: 'error', message: 'Online search failed (status ' + r.status + '). Try again later or use the offline library.', results: [], query: query };
      else {
        var results = (Array.isArray(d.results) ? d.results : []).map(function (x) {
          var per = normalisePer100(x);
          return per && cleanText(x.name, 120) ? { name: cleanText(x.name, 120), brand: cleanText(x.brand, 80), kcal: per.kcal, protein: per.protein, carbs: per.carbs, fat: per.fat, unit: 'g', portion: 100, source: 'usda' } : null;
        }).filter(Boolean).slice(0, 14);
        CTX.ui.usda = { status: 'done', message: results.length ? results.length + ' results.' : 'No results. Try different words.', results: results, query: query };
      }
      render({ focusId: 'usda-q' });
    });
  }

  function barcodeLookup(code) {
    var v = validateBarcode(code);
    var bc = CTX.ui.barcode;
    bc.code = typeof code === 'string' ? code : '';
    bc.product = null;
    if (!v.ok) { bc.status = 'invalid'; bc.message = v.error; render({ focusId: 'barcode-code' }); return Promise.resolve(); }
    bc.status = 'loading'; bc.message = '';
    render({ focusId: 'barcode-code' });
    return fetchJSON('/.netlify/functions/barcode?code=' + encodeURIComponent(v.code)).then(function (r) {
      var d = r.data || {};
      if (r.offline) { bc.status = 'error'; bc.message = offlineMessage('barcode'); }
      else if (r.status === 400) { bc.status = 'invalid'; bc.message = cleanText(d.message, 200) || 'That barcode is not valid.'; }
      else if (r.status === 404) { bc.status = 'notfound'; bc.message = 'No product with barcode ' + v.code + ' was found in Open Food Facts. You can add it as a custom food.'; }
      else if (!r.ok || !d.product) { bc.status = 'error'; bc.message = 'Barcode lookup is unavailable right now (status ' + r.status + '). Try again later or add a custom food.'; }
      else {
        var p = d.product;
        var per = normalisePer100(p);
        if (!per) { bc.status = 'notfound'; bc.message = 'This product has no usable nutrition values. Please add it as a custom food from the label.'; }
        else {
          bc.status = 'done'; bc.message = 'Product found.';
          bc.product = { name: cleanText(p.name, 120) || 'Unnamed product', brand: cleanText(p.brand, 80), image: safeImageUrl(p.image), serving: cleanText(p.serving, 60), unit: p.unit === 'ml' ? 'ml' : 'g', kcal: per.kcal, protein: per.protein, carbs: per.carbs, fat: per.fat, portion: 100, source: 'off', code: v.code };
        }
      }
      render({ focusId: 'barcode-code' });
    });
  }

  function stopCamera() {
    if (cameraTimer) { clearTimeout(cameraTimer); cameraTimer = null; }
    if (cameraStream) { cameraStream.getTracks().forEach(function (t) { t.stop(); }); cameraStream = null; }
    var v = document.getElementById('scan-video');
    if (v) v.srcObject = null;
  }

  function startCamera() {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      CTX.ui.barcode.cameraSupported = false;
      CTX.ui.barcode.message = 'Camera scanning is not available here. Type the barcode number instead.';
      render();
      return Promise.resolve();
    }
    openDialog('<h2 id="dialog-title">Scan a barcode</h2><p>Hold the barcode steady inside the frame.</p><video id="scan-video" class="scan-video" playsinline muted></video>' +
      '<p class="muted small" role="status" id="scan-status">Starting camera…</p><div class="dialog-actions"><button type="button" class="btn btn-ghost" data-action="dialog-close">Cancel</button></div>', 'scan');
    var detector;
    try { detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); }
    catch (e) { detector = new window.BarcodeDetector(); }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (stream) {
      if (dialogKind !== 'scan') { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      cameraStream = stream;
      var video = document.getElementById('scan-video');
      video.srcObject = stream;
      return video.play().then(function () {
        $('#scan-status').textContent = 'Camera on. Looking for a barcode…';
        var tick = function () {
          if (!cameraStream) return;
          detector.detect(video).then(function (codes) {
            var hit = codes && codes[0] && codes[0].rawValue;
            if (hit) { stopCamera(); closeDialog(); CTX.ui.foodTab = 'barcode'; barcodeLookup(String(hit)); }
            else cameraTimer = setTimeout(tick, 300);
          }).catch(function () { cameraTimer = setTimeout(tick, 500); });
        };
        tick();
      });
    }).catch(function () {
      stopCamera();
      closeDialog();
      CTX.ui.barcode.status = 'error';
      CTX.ui.barcode.message = 'Camera access was denied or is unavailable. Type the barcode number instead.';
      render({ focusId: 'barcode-code' });
    });
  }

  function wgerSearch(q) {
    var query = cleanText(q, 60);
    if (query.length < 2) { CTX.ui.wger = { status: 'error', message: 'Enter at least two characters.', results: [], query: query }; render({ focusId: 'wger-q' }); return Promise.resolve(); }
    CTX.ui.wger = { status: 'loading', message: '', results: [], query: query };
    render({ focusId: 'wger-q' });
    return fetchJSON('/.netlify/functions/exercises?q=' + encodeURIComponent(query)).then(function (r) {
      var d = r.data || {};
      var results = r.ok && Array.isArray(d.results) ? d.results.map(function (x) {
        return cleanText(x.name, 100) ? { name: cleanText(x.name, 100), category: cleanText(x.category, 60), image: safeImageUrl(x.image), description: cleanText(x.description, 300) } : null;
      }).filter(Boolean).slice(0, 12) : null;
      if (!results) CTX.ui.wger = { status: 'error', message: (r.offline ? 'You appear to be offline.' : 'Online exercise search is unavailable right now.') + ' The built-in technique library below still works.', results: [], query: query };
      else CTX.ui.wger = { status: 'done', message: results.length ? results.length + ' exercises found.' : 'No exercises found. Try the built-in technique library below.', results: results, query: query };
      render({ focusId: 'wger-q' });
    });
  }

  /* Workouts */
  function ensureWorkout(date) {
    if (!S.workouts[date]) S.workouts[date] = workoutFor(S, date).record;
    return S.workouts[date];
  }

  /* Accounts */
  function onAccountChange(snap) {
    CTX.account = snap || CTX.account;
    var btn = $('#account-button');
    if (btn) {
      btn.innerHTML = renderAccountButton(CTX.account);
      btn.setAttribute('aria-label', CTX.account.status === 'signed-in' ? 'Account: ' + ((CTX.account.user && (CTX.account.user.name || CTX.account.user.email)) || 'signed in') : 'Account and sync: sign in');
    }
    var st = $('#settings-account-status');
    if (st) st.textContent = accountStatusText(CTX.account);
    refreshAccountDialog();
  }

  function applyCloudState(cloud) {
    var next = normaliseState(cloud && cloud.state);
    S = next;
    persist({ skipSync: true });
    applyTheme();
    render({ focusTitle: true });
  }

  function firstSignIn() {
    var acc = account();
    return acc.pull().then(function (cloud) {
      cloudCandidate = cloud;
      var local = hasMeaningfulData(S);
      if (cloud && local) openDialog(renderMergePrompt('both'), 'merge');
      else if (cloud) openDialog(renderMergePrompt('restore'), 'merge');
      else if (local) openDialog(renderMergePrompt('upload'), 'merge');
      else { acc.setSyncEnabled(true); return acc.push().then(function () { toast('Signed in. Sync is on.'); }); }
    });
  }

  function accountAction(fn, success) {
    return Promise.resolve().then(fn).then(function (res) {
      if (success) toast(typeof success === 'function' ? success(res) : success);
      return res;
    }).catch(function (err) {
      toast((err && err.message) || 'The account action failed. Your local data is unchanged.');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Action dispatcher                                                   */
  /* ------------------------------------------------------------------ */

  function handleAction(action, el, ev) {
    var ui = CTX.ui;
    var acc = account();
    var data, v, item, list, date, w, idx;
    switch (action) {
      /* navigation and chrome */
      case 'theme-toggle':
        S.ui.theme = THEMES[(THEMES.indexOf(S.ui.theme) + 1) % THEMES.length];
        applyTheme(); persist(); render();
        toast('Theme: ' + (S.ui.theme === 'system' ? 'match system' : S.ui.theme));
        return;
      case 'theme-set':
        if (THEMES.indexOf(el.value) >= 0) { S.ui.theme = el.value; applyTheme(); persist(); render(); }
        return;
      case 'skip-to-main': $('#main').focus(); return;
      case 'dialog-close': closeDialog(); return;
      case 'confirm-yes': finishConfirm(true); return;
      case 'confirm-no': finishConfirm(false); return;

      /* onboarding, profile and targets */
      case 'onboarding-submit':
        data = formData(el);
        v = validateProfile(data);
        if (!isValidDate(data.startDate)) v.errors.startDate = 'Choose a valid start date.';
        if (!v.ok || v.errors.startDate) { setErrors('onboarding', v.errors, data); render({ focusInvalid: true }); return; }
        clearErrors('onboarding');
        S.profile = Object.assign({}, v.value, { onboarded: true });
        applyCalculatedTargets();
        S.mission.startDate = data.startDate;
        S.builder.diet = S.profile.diet;
        persist(); render({ focusTitle: true });
        toast('Targets set: ' + fmtInt(S.targets.kcal) + ' kcal and ' + fmtInt(S.targets.protein) + ' g protein a day.');
        return;
      case 'profile-submit':
        data = formData(el);
        v = validateProfile(data);
        if (!v.ok) { setErrors('profile', v.errors, data); render({ focusInvalid: true }); return; }
        clearErrors('profile');
        S.profile = Object.assign({}, v.value, { onboarded: true });
        applyCalculatedTargets();
        persist(); render();
        toast('Profile saved and targets recalculated.');
        return;
      case 'targets-submit':
        data = formData(el);
        v = validateTargets(data);
        if (!v.ok) { setErrors('targets', v.errors, data); render({ focusInvalid: true }); return; }
        clearErrors('targets');
        S.targets = Object.assign({}, v.value, { source: 'manual' });
        persist(); render();
        toast(v.value.kcal < (FLOORS[S.profile.sex] || 1200) ? 'Saved. Note: this is below the software floor.' : 'Targets saved.');
        return;
      case 'targets-recalculate':
        if (!applyCalculatedTargets()) { toast('Complete your profile first.'); return; }
        clearErrors('targets'); persist(); render(); toast('Targets recalculated from your profile.');
        return;
      case 'split-submit':
        data = formData(el);
        v = validateSplit(data);
        if (!v.ok) { setErrors('split', v.errors, data); render({ focusInvalid: true }); return; }
        clearErrors('split'); S.mealSplit = v.value; persist(); render(); toast('Meal split saved.');
        return;
      case 'mission-submit':
        data = formData(el);
        if (!isValidDate(data.startDate)) { setErrors('mission', { startDate: 'Choose a valid date.' }, null); render({ focusInvalid: true }); return; }
        clearErrors('mission'); S.mission.startDate = data.startDate; persist(); render(); toast('Mission start date saved.');
        return;

      /* dashboard */
      case 'water-add':
        date = CTX.today;
        item = Object.assign({}, S.health[date] || {});
        item.waterMl = Math.min(10000, Math.max(0, (item.waterMl || 0) + (toNumber(el.getAttribute('data-amount')) || 0)));
        item.updatedAt = new Date().toISOString();
        v = normaliseHealth(item);
        if (v) S.health[date] = v; else delete S.health[date];
        persist(); render();
        return;

      /* food diary */
      case 'food-date-prev': shiftDate('foodDate', -1); render(); return;
      case 'food-date-next': shiftDate('foodDate', 1); render(); return;
      case 'food-date-today': shiftDate('foodDate', 0); render(); return;
      case 'food-date-set': if (isValidDate(el.value)) { ui.foodDate = el.value; render(); } else toast('Choose a valid date.'); return;
      case 'food-tab': ui.foodTab = el.getAttribute('data-tab'); render(); return;
      case 'food-meal-set': if (MEALS.indexOf(el.value) >= 0) { ui.foodMeal = el.value; render(); } return;
      case 'food-cat-set': ui.foodCat = el.value; render(); return;
      case 'food-search':
        ui.foodQuery = el.value;
        $('#food-results').innerHTML = renderFoodResults(ui.foodQuery, ui.foodCat, S.profile.diet);
        return;
      case 'food-add-to-meal':
        ui.foodMeal = el.getAttribute('data-meal');
        render({ focusId: 'add-food-title' });
        if ($('#add-food') && $('#add-food').scrollIntoView) $('#add-food').scrollIntoView({ block: 'start' });
        return;
      case 'food-add-open':
        item = FOOD_BY_ID[el.getAttribute('data-food-id')];
        if (!item) return;
        pendingFood = Object.assign({ source: 'library', foodId: item.id }, item);
        openDialog(renderAddDialog(pendingFood, CTX, ui.foodDate), 'add');
        return;
      case 'usda-add':
        item = ui.usda.results[toNumber(el.getAttribute('data-index'))];
        if (!item) return;
        pendingFood = item;
        openDialog(renderAddDialog(item, CTX, ui.foodDate), 'add');
        return;
      case 'barcode-add':
        if (!ui.barcode.product) return;
        pendingFood = ui.barcode.product;
        openDialog(renderAddDialog(pendingFood, CTX, ui.foodDate), 'add');
        return;
      case 'add-preview':
        if (!pendingFood) return;
        v = toNumber(el.value);
        $('#add-preview').textContent = Number.isFinite(v) && v > 0 ? fmtInt(pendingFood.kcal * v / 100) + ' kcal · ' + fmt1(pendingFood.protein * v / 100) + ' g protein' : 'Enter a portion size.';
        return;
      case 'add-entry-submit':
        ev && ev.preventDefault();
        data = formData(el);
        v = toNumber(data.grams);
        if (!pendingFood || !Number.isFinite(v) || v <= 0 || v > 2000) {
          var gi = $('#add-grams');
          gi.setAttribute('aria-invalid', 'true');
          $('#add-preview').textContent = 'Enter a portion between 1 and 2,000.';
          gi.focus();
          return;
        }
        item = normaliseEntry({ meal: data.meal, foodId: pendingFood.foodId, name: pendingFood.name, brand: pendingFood.brand, source: pendingFood.source, grams: v, unit: pendingFood.unit,
          per100: { kcal: pendingFood.kcal, protein: pendingFood.protein, carbs: pendingFood.carbs, fat: pendingFood.fat }, createdAt: new Date().toISOString() });
        if (addEntry(ui.foodDate, item)) {
          ui.foodMeal = item.meal;
          persist(); closeDialog(); render();
          toast(item.name + ' added to ' + MEAL_LABELS[item.meal].toLowerCase() + '.');
        }
        return;
      case 'custom-food-submit':
        data = formData(el);
        v = validateCustomFood(data);
        if (!v.ok) { setErrors('custom', v.errors, data); render({ focusInvalid: true }); return; }
        clearErrors('custom');
        item = normaliseEntry({ meal: ui.foodMeal, name: v.value.name, source: 'custom', grams: v.value.grams, unit: v.value.unit, per100: v.value.per100, createdAt: new Date().toISOString() });
        if (addEntry(ui.foodDate, item)) { persist(); render(); toast(item.name + ' added.'); }
        return;
      case 'entry-edit':
        item = findEntry(el.getAttribute('data-id'));
        if (item) openDialog(renderEditEntryDialog(item.entry), 'edit');
        return;
      case 'entry-edit-submit':
        ev && ev.preventDefault();
        item = findEntry(el.getAttribute('data-id'));
        if (!item) { closeDialog(); return; }
        data = formData(el);
        v = toNumber(data.grams);
        if (!Number.isFinite(v) || v <= 0 || v > 5000) { $('.dialog-body', $('#app-dialog')).innerHTML = renderEditEntryDialog(item.entry, 'Enter a portion between 1 and 5,000.'); $('#edit-grams').focus(); return; }
        item.entry.grams = round1(v);
        if (MEALS.indexOf(data.meal) >= 0) item.entry.meal = data.meal;
        persist(); closeDialog(); render(); toast('Portion updated.');
        return;
      case 'entry-delete':
        item = findEntry(el.getAttribute('data-id'));
        if (!item) return;
        confirmAction('Delete ' + item.entry.name + ' from ' + MEAL_LABELS[item.entry.meal].toLowerCase() + '?', { title: 'Delete entry', confirmLabel: 'Delete', danger: true }).then(function (yes) {
          if (!yes) return;
          var cur = findEntry(item.entry.id);
          if (!cur) return;
          cur.list.splice(cur.index, 1);
          if (!cur.list.length) delete S.diary[ui.foodDate];
          persist(); render(); toast('Entry deleted.');
        });
        return;
      case 'usda-search': usdaSearch(formData(el).q); return;
      case 'barcode-lookup': barcodeLookup(formData(el).code); return;
      case 'barcode-scan-start': startCamera(); return;

      /* planner */
      case 'planner-tab': ui.plannerTab = el.getAttribute('data-tab'); render(); return;
      case 'builder-name': S.builder.name = cleanText(el.value, 80); persist(); return;
      case 'builder-budget':
        v = toNumber(el.value);
        if (!Number.isFinite(v) || v < 100 || v > 3000) { setErrors('builder', { budget: 'Enter a budget between 100 and 3,000 kcal.' }); render({ focusInvalid: true }); return; }
        clearErrors('builder'); S.builder.budget = Math.round(v); persist(); render();
        return;
      case 'builder-diet': if (DIETS[el.value]) { S.builder.diet = el.value; persist(); render(); } return;
      case 'builder-grams':
        idx = toNumber(el.getAttribute('data-index'));
        v = toNumber(el.value);
        if (!S.builder.items[idx] || !Number.isFinite(v) || v <= 0 || v > 2000) {
          if (ev && ev.type === 'change') { el.setAttribute('aria-invalid', 'true'); toast('Enter an amount between 1 and 2,000.'); }
          return;
        }
        el.removeAttribute('aria-invalid');
        S.builder.items[idx].grams = Math.round(v);
        if (ev && ev.type === 'input') { $('#builder-totals').innerHTML = builderTotalsHTML(builderTotals(S.builder.items, S.builder.budget)); return; }
        persist(); render();
        return;
      case 'builder-remove':
        S.builder.items.splice(toNumber(el.getAttribute('data-index')), 1); persist(); render(); return;
      case 'builder-add':
        data = formData(el);
        v = toNumber(data.grams);
        if (!FOOD_BY_ID[data.foodId] || !Number.isFinite(v) || v <= 0 || v > 2000) { setErrors('builder', { grams: 'Enter an amount between 1 and 2,000.' }); render({ focusInvalid: true }); return; }
        if (S.builder.items.length >= CAPS.mealItems) { toast('A meal can hold up to ' + CAPS.mealItems + ' foods.'); return; }
        clearErrors('builder');
        S.builder.items.push({ foodId: data.foodId, grams: Math.round(v) }); persist(); render({ focusId: 'builder-food' });
        return;
      case 'builder-suggest':
        ui.builderSeed = (ui.builderSeed || 0) + 1;
        S.builder.items = suggestBalancedMeal(S.builder.budget, S.builder.diet, ui.builderSeed);
        if (!S.builder.name) S.builder.name = 'Balanced meal';
        persist(); render();
        toast('Suggested a meal of ' + fmtInt(builderTotals(S.builder.items, S.builder.budget).kcal) + ' kcal.');
        return;
      case 'builder-clear':
        S.builder = { name: '', budget: S.builder.budget, items: [], editingId: null, diet: S.builder.diet }; clearErrors('builder'); persist(); render();
        return;
      case 'builder-save':
        if (!S.builder.name) { setErrors('builder', { name: 'Give the meal a name before saving.' }); render({ focusInvalid: true }); return; }
        if (!S.builder.items.length) { toast('Add at least one food before saving.'); return; }
        clearErrors('builder');
        list = S.savedMeals.filter(function (m2) { return m2.id === S.builder.editingId; });
        if (list.length) { list[0].name = S.builder.name; list[0].budget = S.builder.budget; list[0].items = S.builder.items.map(function (i) { return { foodId: i.foodId, grams: i.grams }; }); toast('Saved meal updated.'); }
        else {
          if (S.savedMeals.length >= CAPS.savedMeals) { toast('You can keep up to ' + CAPS.savedMeals + ' saved meals.'); return; }
          item = { id: uid('m'), name: S.builder.name, budget: S.builder.budget, items: S.builder.items.map(function (i) { return { foodId: i.foodId, grams: i.grams }; }), createdAt: new Date().toISOString() };
          S.savedMeals.push(item); S.builder.editingId = item.id; toast('Meal saved.');
        }
        persist(); render();
        return;
      case 'saved-load':
        item = S.savedMeals.filter(function (m2) { return m2.id === el.getAttribute('data-id'); })[0];
        if (!item) return;
        S.builder = { name: item.name, budget: item.budget, items: item.items.map(function (i) { return { foodId: i.foodId, grams: i.grams }; }), editingId: item.id, diet: S.builder.diet };
        persist(); render({ focusId: 'builder-name' }); toast('Loaded into the builder.');
        return;
      case 'saved-duplicate':
        item = S.savedMeals.filter(function (m2) { return m2.id === el.getAttribute('data-id'); })[0];
        if (!item || S.savedMeals.length >= CAPS.savedMeals) return;
        S.savedMeals.push({ id: uid('m'), name: (item.name + ' (copy)').slice(0, 80), budget: item.budget, items: item.items.map(function (i) { return { foodId: i.foodId, grams: i.grams }; }), createdAt: new Date().toISOString() });
        persist(); render(); toast('Meal duplicated.');
        return;
      case 'saved-delete':
        item = S.savedMeals.filter(function (m2) { return m2.id === el.getAttribute('data-id'); })[0];
        if (!item) return;
        confirmAction('Delete the saved meal \u201c' + item.name + '\u201d?', { title: 'Delete saved meal', confirmLabel: 'Delete', danger: true }).then(function (yes) {
          if (!yes) return;
          S.savedMeals = S.savedMeals.filter(function (m2) { return m2.id !== item.id; });
          if (S.builder.editingId === item.id) S.builder.editingId = null;
          persist(); render(); toast('Saved meal deleted.');
        });
        return;
      case 'saved-add':
        item = S.savedMeals.filter(function (m2) { return m2.id === el.getAttribute('data-id'); })[0];
        if (item) openDialog(renderSavedAddDialog(item, CTX), 'saved-add');
        return;
      case 'saved-add-submit':
        ev && ev.preventDefault();
        item = S.savedMeals.filter(function (m2) { return m2.id === el.getAttribute('data-id'); })[0];
        data = formData(el);
        if (!item) { closeDialog(); return; }
        if (!isValidDate(data.date)) { $('#sa-date').setAttribute('aria-invalid', 'true'); $('#sa-date').focus(); toast('Choose a valid date.'); return; }
        v = logItems(item.items, MEALS.indexOf(data.meal) >= 0 ? data.meal : 'lunch', data.date, 'meal');
        persist(); closeDialog(); render();
        toast(v + ' foods from \u201c' + item.name + '\u201d added to ' + fmtDate(data.date) + '.');
        return;
      case 'plan-week': ui.planWeek = toNumber(el.getAttribute('data-week')); ui.planDay = 0; render(); return;
      case 'plan-day': ui.planDay = toNumber(el.getAttribute('data-day')); render(); return;
      case 'plan-grams':
        list = S.plans[ui.planWeek][ui.planDay][el.getAttribute('data-meal')];
        idx = toNumber(el.getAttribute('data-index'));
        v = toNumber(el.value);
        if (!list || !list[idx] || !Number.isFinite(v) || v <= 0 || v > 2000) { el.setAttribute('aria-invalid', 'true'); toast('Enter an amount between 1 and 2,000.'); return; }
        list[idx].grams = Math.round(v); persist(); render();
        return;
      case 'plan-remove':
        list = S.plans[ui.planWeek][ui.planDay][el.getAttribute('data-meal')];
        list.splice(toNumber(el.getAttribute('data-index')), 1); persist(); render();
        return;
      case 'plan-add':
        data = formData(el);
        list = S.plans[ui.planWeek][ui.planDay][el.getAttribute('data-meal')];
        v = toNumber(data.grams);
        if (!FOOD_BY_ID[data.foodId] || !Number.isFinite(v) || v <= 0 || v > 2000) { toast('Enter an amount between 1 and 2,000.'); return; }
        if (list.length >= CAPS.planItems) { toast('A planned meal can hold up to ' + CAPS.planItems + ' foods.'); return; }
        list.push({ foodId: data.foodId, grams: Math.round(v) }); persist(); render();
        return;
      case 'plan-log':
        list = S.plans[ui.planWeek][ui.planDay][el.getAttribute('data-meal')];
        v = logItems(list, el.getAttribute('data-meal'), CTX.today, 'meal');
        persist(); render(); toast(v + ' foods added to today\u2019s ' + MEAL_LABELS[el.getAttribute('data-meal')].toLowerCase() + '.');
        return;
      case 'plan-reset':
        w = ui.planWeek;
        confirmAction('Reset week ' + w + ' (' + TEMPLATE_META[w].name + ') to the original template? Your edits to this week will be lost. Other weeks are not affected.', { title: 'Reset week ' + w, confirmLabel: 'Reset week', danger: true }).then(function (yes) {
          if (!yes) return;
          S.plans[w] = buildTemplateWeek(w); persist(); render(); toast('Week ' + w + ' reset.');
        });
        return;
      case 'groceries-generate':
        data = formData(el);
        S.groceries = generateGroceries(S.plans, data.week, data.household, S.groceries.items);
        persist(); render(); toast('Grocery list generated for week ' + S.groceries.week + ', ' + S.groceries.household + ' ' + (S.groceries.household === 1 ? 'person' : 'people') + '.');
        return;
      case 'grocery-check':
        S.groceries.items.forEach(function (it) { if (it.id === el.getAttribute('data-id')) it.checked = el.checked; }); persist(); render();
        return;
      case 'grocery-qty':
        v = toNumber(el.value);
        if (!Number.isFinite(v) || v < 0 || v > 100000) { el.setAttribute('aria-invalid', 'true'); toast('Enter a quantity from 0 to 100,000.'); return; }
        S.groceries.items.forEach(function (it) { if (it.id === el.getAttribute('data-id')) it.qty = round1(v); }); persist(); render();
        return;
      case 'grocery-remove':
        S.groceries.items = S.groceries.items.filter(function (it) { return it.id !== el.getAttribute('data-id'); }); persist(); render();
        return;
      case 'grocery-add':
        data = formData(el);
        if (!cleanText(data.name, 80)) { $('#ga-name').setAttribute('aria-invalid', 'true'); $('#ga-name').focus(); toast('Enter an item name.'); return; }
        if (S.groceries.items.length >= CAPS.groceries) { toast('The list is full.'); return; }
        S.groceries.items.push({ id: uid('g'), foodId: null, name: cleanText(data.name, 80), qty: clampNum(data.qty, 0, 100000, 0), unit: cleanText(data.unit, 12), aisle: AISLE_ORDER.indexOf(data.aisle) >= 0 ? data.aisle : 'Other', checked: false, custom: true });
        persist(); render({ focusId: 'ga-name' });
        return;
      case 'groceries-print':
        document.body.classList.add('print-groceries');
        window.print();
        setTimeout(function () { document.body.classList.remove('print-groceries'); }, 500);
        return;
      case 'groceries-export-text': download('fit30-groceries-week-' + S.groceries.week + '.txt', groceriesToText(S.groceries), 'text/plain;charset=utf-8'); return;
      case 'groceries-export-json': download('fit30-groceries-week-' + S.groceries.week + '.json', JSON.stringify({ app: APP_ID, kind: 'groceries', groceries: S.groceries }, null, 2), 'application/json'); return;
      case 'prep-check': S.prep.items.forEach(function (it) { if (it.id === el.getAttribute('data-id')) it.done = el.checked; }); persist(); render(); return;
      case 'prep-remove': S.prep.items = S.prep.items.filter(function (it) { return it.id !== el.getAttribute('data-id'); }); persist(); render(); return;
      case 'prep-add':
        data = formData(el);
        if (!cleanText(data.text, 120)) { setErrors('prep', { text: 'Enter a task.' }); render({ focusInvalid: true }); return; }
        if (S.prep.items.length >= CAPS.prep) { toast('The checklist is full.'); return; }
        clearErrors('prep');
        S.prep.items.push({ id: uid('p'), text: cleanText(data.text, 120), done: false, custom: true }); persist(); render({ focusId: 'prep-new' });
        return;
      case 'prep-notes': S.prep.notes = cleanText(el.value, 1000); persist(); return;
      case 'prep-reset':
        confirmAction('Reset the checklist to this week\u2019s template? Custom tasks, ticks and notes will be cleared.', { title: 'Reset checklist', confirmLabel: 'Reset' }).then(function (yes) {
          if (!yes) return;
          S.prep.items = freshPrepItems(); S.prep.notes = ''; S.prep.date = addDays(CTX.today, 1); persist(); render(); toast('Checklist reset.');
        });
        return;
      case 'prep-reminder-toggle':
        if (!el.checked) { S.prep.reminder.enabled = false; persist(); render(); return; }
        if (typeof Notification === 'undefined') { S.prep.reminder.enabled = false; persist(); render(); toast('This browser does not support notifications. The checklist still works.'); return; }
        Promise.resolve(Notification.permission === 'granted' ? 'granted' : Notification.requestPermission()).then(function (perm) {
          S.prep.reminder.enabled = perm === 'granted';
          persist(); render();
          toast(perm === 'granted' ? 'Reminder on for ' + S.prep.reminder.time + ' while the app is open.' : 'Notifications were not allowed. The checklist still works without them.');
        }).catch(function () { S.prep.reminder.enabled = false; persist(); render(); toast('Notifications are unavailable. The checklist still works.'); });
        return;
      case 'prep-reminder-time':
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(el.value)) { S.prep.reminder.time = el.value; S.prep.reminder.lastNotified = null; persist(); }
        return;

      /* training */
      case 'train-date-prev': shiftDate('trainDate', -1); render(); return;
      case 'train-date-next': shiftDate('trainDate', 1); render(); return;
      case 'train-date-today': shiftDate('trainDate', 0); render(); return;
      case 'train-date-set': if (isValidDate(el.value)) { ui.trainDate = el.value; render(); } else toast('Choose a valid date.'); return;
      case 'train-go': ui.trainDate = el.getAttribute('data-date'); render({ focusTitle: true }); return;
      case 'workout-field':
        w = ensureWorkout(ui.trainDate);
        item = w.exercises[toNumber(el.getAttribute('data-index'))];
        if (!item) return;
        var f = el.getAttribute('data-field');
        if (f === 'notes') item.notes = cleanText(el.value, 300);
        else {
          var limits = { sets: [0, 20], reps: [0, 200], loadKg: [0, 500], durationSec: [0, 7200] }[f];
          v = toNumber(el.value);
          if (!limits || !Number.isFinite(v) || v < limits[0] || v > limits[1]) { el.setAttribute('aria-invalid', 'true'); toast('Enter a number from ' + limits[0] + ' to ' + limits[1] + '.'); return; }
          item[f] = f === 'loadKg' ? round1(v) : Math.round(v);
        }
        w.updatedAt = new Date().toISOString(); persist(); render();
        return;
      case 'workout-meta':
        w = ensureWorkout(ui.trainDate);
        if (el.name === 'aerobicMin') {
          v = toNumber(el.value === '' ? '0' : el.value);
          if (!Number.isFinite(v) || v < 0 || v > 600) { el.setAttribute('aria-invalid', 'true'); toast('Enter aerobic minutes from 0 to 600.'); return; }
          w.aerobicMin = Math.round(v);
        } else if (el.name === 'difficulty') w.difficulty = intOrNull(el.value, 1, 10);
        else if (el.name === 'painNote') w.painNote = cleanText(el.value, 500);
        else if (el.name === 'notes') w.notes = cleanText(el.value, 1000);
        w.updatedAt = new Date().toISOString(); persist(); render();
        return;
      case 'workout-symptom':
        w = ensureWorkout(ui.trainDate);
        if (el.checked) { if (w.symptoms.indexOf(el.value) === -1 && WARNING_SYMPTOMS[el.value]) w.symptoms.push(el.value); w.completed = false; }
        else w.symptoms = w.symptoms.filter(function (s2) { return s2 !== el.value; });
        w.updatedAt = new Date().toISOString(); persist(); render();
        return;
      case 'workout-complete':
        w = ensureWorkout(ui.trainDate);
        if (w.symptoms.length) { toast('A warning symptom is selected, so this session cannot be marked complete. Save it as stopped instead.'); render(); return; }
        w.completed = true; w.stopped = false; w.updatedAt = new Date().toISOString(); persist(); render();
        toast('Session completed. Well done.');
        return;
      case 'workout-stop':
        w = ensureWorkout(ui.trainDate);
        w.stopped = true; w.completed = false; w.updatedAt = new Date().toISOString(); persist(); render();
        toast('Saved as stopped. Stopping when something feels wrong is the right call.');
        return;
      case 'workout-minimum':
        date = ui.trainDate;
        confirmAction('Replace this day\u2019s session with the 12-minute minimum? Anything already entered for this session will be replaced.', { title: 'Swap session', confirmLabel: 'Use 12-minute session' }).then(function (yes) {
          if (!yes) return;
          var info = missionInfo(S.mission.startDate, date);
          S.workouts[date] = buildSession('minimum', info.status === 'unset' ? 1 : info.phase);
          S.workouts[date].updatedAt = new Date().toISOString();
          persist(); render(); toast('Switched to the 12-minute minimum session.');
        });
        return;
      case 'workout-reset':
        date = ui.trainDate;
        confirmAction('Clear what you recorded for this day and go back to the planned session?', { title: 'Reset session', confirmLabel: 'Reset', danger: true }).then(function (yes) {
          if (!yes) return;
          delete S.workouts[date]; persist(); render(); toast('Session reset to plan.');
        });
        return;
      case 'wger-search': wgerSearch(formData(el).q); return;

      /* progress */
      case 'health-date':
        if (isValidDate(el.value)) { ui.healthDate = el.value; clearErrors('health'); render(); }
        return;
      case 'health-submit':
        data = formData(el);
        if (!isValidDate(data.date)) { setErrors('health', { date: 'Choose a valid date.' }, data); render({ focusInvalid: true }); return; }
        v = validateHealth(data);
        if (!v.ok) { setErrors('health', v.errors, data); render({ focusInvalid: true }); return; }
        clearErrors('health');
        ui.healthDate = data.date;
        item = normaliseHealth(Object.assign({}, v.value, { updatedAt: new Date().toISOString() }));
        if (item) S.health[data.date] = item; else delete S.health[data.date];
        persist(); render(); toast('Check-in saved for ' + fmtDate(data.date) + '.');
        return;

      /* data controls */
      case 'data-export':
        download('fit30-reset-backup-' + CTX.today + '.json', JSON.stringify(exportPayload(S), null, 2), 'application/json');
        toast('Backup downloaded.');
        return;
      case 'data-import':
        var file = el.files && el.files[0];
        el.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { ui.importError = 'That file is larger than 5 MB, so nothing was changed.'; render(); return; }
        file.text().then(function (text) {
          var res = parseImport(text);
          if (!res.ok) { ui.importError = res.error; render(); toast(res.error); return; }
          ui.importError = '';
          return confirmAction('Replace all data on this device with this backup (' + res.summary.diaryDays + ' diary days, ' + res.summary.healthDays + ' check-ins, ' + res.summary.workouts + ' workouts)? Export a backup first if unsure.', { title: 'Import backup', confirmLabel: 'Replace my data', danger: true }).then(function (yes) {
            if (!yes) { toast('Import cancelled. Nothing changed.'); return; }
            S = res.state; persist(); applyTheme(); render(); toast('Backup imported.');
          });
        }).catch(function () { ui.importError = 'The file could not be read, so nothing was changed.'; render(); });
        return;
      case 'data-reset':
        confirmAction('Delete all Fit30 Reset data stored in this browser? This cannot be undone. Any cloud copy is not deleted, and sync will be turned off.', { title: 'Reset all data', confirmLabel: 'Delete everything', danger: true }).then(function (yes) {
          if (!yes) return;
          try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
          if (acc) acc.setSyncEnabled(false);
          S = defaultState(); CTX = makeContext({ account: CTX.account, ui: { barcode: { status: 'idle', message: '', product: null, cameraSupported: 'BarcodeDetector' in window } } });
          applyTheme();
          if (window.location.hash !== '#dashboard') window.location.hash = '#dashboard';
          render({ focusTitle: true }); toast('All local data deleted.');
        });
        return;

      /* account */
      case 'account-open':
        openDialog(renderAccountDialog(CTX.account), 'account');
        return;
      case 'account-sign-in':
        if (acc) accountAction(function () { return acc.signIn(); });
        return;
      case 'account-sign-out':
        if (acc) accountAction(function () { return acc.signOut(); }, 'Signed out. Your data stays on this device and in the cloud copy.');
        return;
      case 'account-sync-toggle':
        if (!acc) return;
        if (CTX.account.syncEnabled) { acc.setSyncEnabled(false); toast('Sync is off. Changes stay on this device.'); }
        else { acc.setSyncEnabled(true); accountAction(function () { return acc.push(); }, 'Sync is on.'); }
        return;
      case 'account-sync-now':
        if (acc) accountAction(function () { return acc.push({ force: true }); }, 'Uploaded to the cloud.');
        return;
      case 'account-restore':
        if (!acc) return;
        confirmAction('Replace the data on this device with your cloud copy?', { title: 'Restore from cloud', confirmLabel: 'Restore', danger: true }).then(function (yes) {
          if (!yes) return;
          return accountAction(function () {
            return acc.pull().then(function (cloud) {
              if (!cloud) throw new Error('There is no cloud copy yet.');
              applyCloudState(cloud);
              return cloud;
            });
          }, 'Cloud copy restored.');
        });
        return;
      case 'account-replace-cloud':
        if (!acc) return;
        confirmAction('Replace your cloud copy with the data on this device?', { title: 'Replace cloud copy', confirmLabel: 'Replace cloud copy', danger: true }).then(function (yes) {
          if (yes) return accountAction(function () { return acc.push({ force: true }); }, 'Cloud copy replaced.');
        });
        return;
      case 'account-delete-cloud':
        if (!acc) return;
        confirmAction('Delete the cloud copy? Data on this device is kept. Sync will be turned off.', { title: 'Delete cloud copy', confirmLabel: 'Delete cloud copy', danger: true }).then(function (yes) {
          if (yes) return accountAction(function () { return acc.deleteCloud(); }, 'Cloud copy deleted. Local data kept.');
        });
        return;
      case 'account-delete-account':
        if (!acc) return;
        confirmAction('Delete your account and its cloud copy? You will be signed out. Data on this device is kept.', { title: 'Delete account', confirmLabel: 'Delete account', danger: true }).then(function (yes) {
          if (yes) return accountAction(function () { return acc.deleteAccount(); }, 'Account deleted and signed out. Local data kept.');
        });
        return;
      case 'merge-keep-device':
        closeDialog();
        if (acc) { acc.setSyncEnabled(true); accountAction(function () { return acc.push({ force: true }); }, 'This device\u2019s data is now the cloud copy. Sync is on.'); }
        return;
      case 'merge-use-cloud':
        closeDialog();
        if (cloudCandidate && acc) { applyCloudState(cloudCandidate); acc.setSyncEnabled(true); acc.markSynced && acc.markSynced(); toast('Cloud copy restored. Sync is on.'); }
        return;
      case 'merge-keep-both':
        if (!cloudCandidate || !acc) { closeDialog(); return; }
        download('fit30-reset-device-backup-' + CTX.today + '.json', JSON.stringify(exportPayload(S), null, 2), 'application/json');
        closeDialog();
        applyCloudState(cloudCandidate); acc.setSyncEnabled(true); acc.markSynced && acc.markSynced();
        toast('Device backup downloaded, then the cloud copy was restored. Sync is on.');
        return;
      case 'merge-dismiss':
        closeDialog();
        if (acc) acc.setSyncEnabled(false);
        toast('Sync stays off. You can choose later in Account and sync.');
        return;
      default:
        if (typeof console !== 'undefined') console.warn('Unhandled action', action);
    }
  }

  function applyCalculatedTargets() {
    var t = calcTargets(S.profile);
    if (!t.ok) return false;
    S.targets = { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, waterMl: t.waterMl, steps: S.targets.steps || 8000, sleepMin: S.targets.sleepMin || 450, source: 'calculated' };
    return true;
  }

  function isTextLike(el) {
    return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', 'number', 'date', 'time', 'email'].indexOf(el.type) >= 0);
  }

  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.tagName === 'DIALOG') { if (t.id === 'confirm-dialog') finishConfirm(false); else t.close(); return; }
      var el = t && t.closest ? t.closest('button[data-action], a[data-action]') : null;
      if (!el || el.disabled) return;
      ev.preventDefault();
      handleAction(el.getAttribute('data-action'), el, ev);
    });
    document.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || !el.getAttribute('data-action') || el.tagName === 'FORM' || el.tagName === 'BUTTON') return;
      handleAction(el.getAttribute('data-action'), el, ev);
    });
    document.addEventListener('input', function (ev) {
      var el = ev.target;
      var live = el && el.getAttribute && el.getAttribute('data-live');
      if (live) handleAction(live, el, ev);
    });
    document.addEventListener('submit', function (ev) {
      var form = ev.target;
      var action = form && form.getAttribute('data-action');
      if (!action) return;
      ev.preventDefault();
      handleAction(action, form, ev);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && isTextLike(ev.target) && ev.target.getAttribute('data-action') && !ev.target.form) {
        ev.preventDefault();
        ev.target.blur();
        ev.target.focus();
      }
    });
    var dlg = $('#app-dialog');
    dlg.addEventListener('close', function () {
      stopCamera();
      var kind = dialogKind;
      dialogKind = null;
      pendingFood = null;
      if (kind === 'merge' && account() && !account().getState().syncEnabled) cloudCandidate = cloudCandidate || null;
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
      else { var h = $('#view-title') || $('#hero-title'); if (h) h.focus(); }
    });
    var cdlg = $('#confirm-dialog');
    cdlg.addEventListener('close', function () {
      var r = confirmResolve;
      confirmResolve = null;
      var opener = cdlg._opener;
      if (opener && document.contains(opener)) opener.focus();
      if (r) r(cdlg.returnValue === 'yes');
    });
    window.addEventListener('hashchange', function () { stopCamera(); if ($('#app-dialog').open) closeDialog(); render(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') stopCamera(); });
    window.addEventListener('afterprint', function () { document.body.classList.remove('print-groceries'); });
    window.addEventListener('unhandledrejection', function (ev) {
      ev.preventDefault();
      toast('Something did not complete. Your data on this device is safe.');
    });
    window.addEventListener('storage', function (ev) {
      if (ev.key === STORAGE_KEY) { S = loadState(); applyTheme(); render(); }
    });
  }

  function boot() {
    S = loadState();
    CTX = makeContext();
    CTX.ui.barcode.cameraSupported = 'BarcodeDetector' in window;
    CTX.account = { status: 'loading', user: null, syncEnabled: false, lastUpload: null };
    document.documentElement.classList.add('js');
    applyTheme();
    bindEvents();
    render({ initial: true });
    onAccountChange(CTX.account);
    setInterval(function () {
      var now = todayISO();
      if (now !== CTX.today) { CTX.today = now; render(); }
    }, 60000);
    startReminderLoop();
    var acc = account();
    if (acc) {
      acc.onChange(onAccountChange);
      acc.init({ getState: function () { return S; } }).then(function () {
        if (acc.consumeJustSignedIn()) return firstSignIn();
      }).catch(function () { /* account layer reports its own errors */ });
    } else {
      onAccountChange({ status: 'disabled', message: 'The account module did not load. Everything still works locally.', user: null, syncEnabled: false, lastUpload: null });
    }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support unavailable */ });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  return {
    STORAGE_KEY: STORAGE_KEY, APP_ID: APP_ID, MEALS: MEALS, ROUTES: ROUTES, FOODS: FOODS, FOOD_BY_ID: FOOD_BY_ID, CATEGORIES: CATEGORIES,
    ACTIVITY: ACTIVITY, DEFICITS: DEFICITS, FLOORS: FLOORS, PHASES: PHASES, EXERCISES: EXERCISES, WARNING_SYMPTOMS: WARNING_SYMPTOMS, TEMPLATE_META: TEMPLATE_META,
    esc: esc, isValidDate: isValidDate, addDays: addDays, diffDays: diffDays, todayISO: todayISO,
    validateProfile: validateProfile, calcBMR: calcBMR, calcTargets: calcTargets, floorExplanation: floorExplanation, validateSplit: validateSplit, validateTargets: validateTargets,
    normaliseEntry: normaliseEntry, entryFromFood: entryFromFood, entryTotals: entryTotals, dayTotals: dayTotals, validateCustomFood: validateCustomFood, searchFoods: searchFoods,
    builderTotals: builderTotals, builderPrompts: builderPrompts, suggestBalancedMeal: suggestBalancedMeal,
    buildTemplateWeek: buildTemplateWeek, defaultPlans: defaultPlans, generateGroceries: generateGroceries, groceriesToText: groceriesToText,
    missionInfo: missionInfo, phaseForDay: phaseForDay, sessionTypeForDay: sessionTypeForDay, buildSession: buildSession, weekRangeFor: weekRangeFor, trainingStats: trainingStats,
    adherenceForDay: adherenceForDay, sevenDayAdherence: sevenDayAdherence, rollingAverage: rollingAverage, progressStats: progressStats, dateRange: dateRange,
    lineChart: lineChart, barChart: barChart, validateBarcode: validateBarcode, safeImageUrl: safeImageUrl,
    defaultState: defaultState, normaliseState: normaliseState, normaliseHealth: normaliseHealth, validateHealth: validateHealth, parseImport: parseImport, exportPayload: exportPayload, hasMeaningfulData: hasMeaningfulData,
    makeContext: makeContext, renderView: renderView, renderFoodResults: renderFoodResults, renderAccountDialog: renderAccountDialog, renderAccountButton: renderAccountButton, renderMergePrompt: renderMergePrompt,
    accountStatusText: accountStatusText, handleAction: handleAction, boot: boot
  };
});
