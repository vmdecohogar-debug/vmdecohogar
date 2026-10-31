import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';
import { migrate } from './migrate.js';
import { loadCatalog } from './catalogo.js';
import { normalizePhone } from '../services/sellers.js';

// Productos de ejemplo de bazar y deco (precios a vendedora y sugeridos, en centavos).
const PRODUCTS = [
  ['VEL-001', 'Vela aromática de soja 200 g', 450000, 650000],
  ['DIF-001', 'Difusor de varillas 100 ml', 520000, 750000],
  ['MAN-001', 'Mantel de lino 1,40 x 2 m', 980000, 1400000],
  ['TAZ-001', 'Set de 2 tazas de cerámica', 610000, 880000],
  ['FLO-001', 'Florero de vidrio esmerilado', 540000, 780000],
  ['ALM-001', 'Almohadón con funda 45 x 45', 700000, 990000],
  ['POR-001', 'Portavelas de madera', 320000, 460000],
  ['CES-001', 'Cesto de seagrass mediano', 860000, 1250000],
  ['IND-001', 'Individuales de yute x 4', 480000, 690000],
  ['SAH-001', 'Sahumerios artesanales x 10', 150000, 230000],
  ['CUA-001', 'Cuadro botánico 30 x 40', 760000, 1100000],
  ['PLA-001', 'Plato de sitio de ratán', 390000, 560000],
];

export async function seed({ adminPhone = '1100000000', adminPassword, sampleProducts = false, catalog = false } = {}) {
  if (!adminPassword) {
    if (process.env.NODE_ENV === 'production') throw new Error('Definí ADMIN_PASSWORD para crear el usuario de administración.');
    adminPassword = 'admin123';
  }
  await migrate();
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (name, phone, password_hash, role, status) VALUES ('Administración', $1, $2, 'admin', 'active')
     ON CONFLICT (phone) DO NOTHING`,
    [normalizePhone(adminPhone), hash],
  );
  for (const [sku, name, price, suggested] of sampleProducts ? PRODUCTS : []) {
    await pool.query(
      `INSERT INTO products (sku, name, price, suggested_price, stock) VALUES ($1, $2, $3, $4, 100) ON CONFLICT (sku) DO NOTHING`,
      [sku, name, price, suggested],
    );
  }
  // Catálogo de la tienda (una sola vez): 256 productos del PDF con fotos.
  if (catalog) console.log('catálogo', await loadCatalog());
  await pool.query(`INSERT INTO zones (name, locality) SELECT 'Zona inicial', 'A definir' WHERE NOT EXISTS (SELECT 1 FROM zones)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed({
    adminPhone: process.env.ADMIN_PHONE || undefined,
    adminPassword: process.env.ADMIN_PASSWORD,
    sampleProducts: process.env.SEED_SAMPLE_PRODUCTS === 'true',
    catalog: process.env.LOAD_CATALOG !== 'false',
  })
    .then(() => {
      console.log('Datos iniciales cargados. Admin: teléfono', process.env.ADMIN_PHONE ?? '11 0000 0000');
      return pool.end();
    }, (err) => { console.error(err); process.exit(1); });
}
