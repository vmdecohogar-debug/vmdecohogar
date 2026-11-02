import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDiscount, cleanTheme, computePrices, discountedPrice, fontFamilyFromUrl, priceFromCost, promoPrices, safeLink, slugify } from '../src/rules/store.js';

test('precio desde el costo con margen y redondeo hacia arriba a los $100', () => {
  assert.equal(priceFromCost(198400, 50), 300000); // $1.984 × 1,50 = $2.976 → $3.000
  assert.equal(priceFromCost(198400, 65), 330000); // $3.273,60 → $3.300
  assert.equal(priceFromCost(120000, 65), 200000); // $1.980 → $2.000
  assert.equal(priceFromCost(120000, 65, 10), 198000); // redondeo a $10
  assert.equal(priceFromCost(0, 65), null);
});

test('precios por margen: usa los generales o los del producto', () => {
  const store = { margins: { list: 65, wholesale: 50 }, rounding: 100 };
  assert.deepEqual(computePrices({ price_mode: 'margin', cost: 1000000 }, store), { list_price: 1650000, wholesale_price: 1500000, errors: [] });
  const own = computePrices({ price_mode: 'margin', cost: 1000000, list_margin: 80, wholesale_margin: 40 }, store);
  assert.equal(own.list_price, 1800000);
  assert.equal(own.wholesale_price, 1400000);
  assert.deepEqual(computePrices({ price_mode: 'margin' }, store).errors, ['Falta el costo.']);
});

test('precios a mano: se respetan tal cual', () => {
  const r = computePrices({ price_mode: 'manual', cost: 462000, list_price: 770000, wholesale_price: 690000 });
  assert.deepEqual(r, { list_price: 770000, wholesale_price: 690000, errors: [] });
  assert.equal(computePrices({ price_mode: 'manual', list_price: 500000 }).wholesale_price, 500000);
  assert.ok(computePrices({ price_mode: 'manual', list_price: 500000, wholesale_price: 600000 }).errors.length);
  assert.ok(computePrices({ price_mode: 'manual' }).errors.length);
});

test('slugs sin tildes', () => {
  assert.equal(slugify('Organización y Baño'), 'organizacion-y-bano');
  assert.equal(slugify('  Rallador 4 caras "Noir" VM-007 '), 'rallador-4-caras-noir-vm-007');
});

test('tipografías desde enlaces de Google Fonts y colores válidos', () => {
  assert.equal(fontFamilyFromUrl('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&display=swap'), 'Playfair Display');
  const colors = Object.fromEntries(['primary', 'onPrimary', 'primarySoft', 'accent', 'accentSoft', 'bg', 'surface', 'text', 'textSoft', 'line', 'footerBg', 'footerText'].map((k) => [k, '#AABBCC']));
  const fonts = { brand: { url: 'https://fonts.googleapis.com/css2?family=Montserrat' }, title: { family: 'Arial' }, body: { family: 'Arial' }, banner: { family: 'Arial' }, bannerSub: { family: 'Arial' } };
  const ok = cleanTheme({ light: colors, dark: colors, fonts });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.theme.light.primary, '#aabbcc');
  assert.equal(ok.theme.fonts.brand.family, 'Montserrat');
  const bad = cleanTheme({ light: { ...colors, primary: 'red' }, dark: colors, fonts: { ...fonts, title: { url: 'https://evil.com/x.css' } } });
  assert.equal(bad.errors.length, 3); // color + enlace ajeno + falta la familia
});

test('links de banners: solo web o páginas de la tienda', () => {
  assert.equal(safeLink('/categoria/cocina'), '/categoria/cocina');
  assert.equal(safeLink('https://wa.me/541100000000'), 'https://wa.me/541100000000');
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('//evil.com'), null);
  assert.equal(safeLink(''), null);
});

test('descuento: precio promocional redondeado hacia arriba a los $100', () => {
  assert.equal(discountedPrice(330000, 20), 270000); // $3.300 − 20% = $2.640 → $2.700
  assert.equal(discountedPrice(300000, 10), 270000); // $3.000 − 10% = $2.700 justo
  assert.equal(discountedPrice(50000, 1), null, 'si con el redondeo no baja, no hay promo');
  assert.equal(discountedPrice(330000, null), null);
  assert.deepEqual(promoPrices({ list_price: 330000, wholesale_price: 300000, discount_pct: 20 }),
    { promo_list_price: 270000, promo_wholesale_price: 240000, errors: [] });
  assert.deepEqual(promoPrices({ list_price: 330000, wholesale_price: 300000, discount_pct: null }),
    { promo_list_price: null, promo_wholesale_price: null, errors: [] });
  assert.equal(promoPrices({ list_price: 50000, wholesale_price: 50000, discount_pct: 1 }).errors.length, 1);
});

test('descuento: valida el %', () => {
  assert.deepEqual(cleanDiscount(''), { pct: null, errors: [] });
  assert.deepEqual(cleanDiscount(0), { pct: null, errors: [] });
  assert.deepEqual(cleanDiscount('15,5'), { pct: 15.5, errors: [] });
  assert.equal(cleanDiscount(100).errors.length, 1);
  assert.equal(cleanDiscount('abc').errors.length, 1);
});
