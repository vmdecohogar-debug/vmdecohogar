-- Tienda online pública: categorías editables, banners, precios por costo y margen, apariencia.

CREATE TABLE categories (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  slug       text NOT NULL UNIQUE,
  icon       text,                 -- emoji o símbolo corto que se ve en la barra de categorías
  image_url  text,                 -- foto para los cuadros de categorías del inicio
  position   int  NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categories (name, slug, icon, position) VALUES
  ('Cocina', 'cocina', '🍳', 1),
  ('Baño', 'bano', '🛁', 2),
  ('Deco', 'deco', '🪴', 3),
  ('Organización', 'organizacion', '🧺', 4),
  ('Limpieza', 'limpieza', '🧽', 5),
  ('Belleza', 'belleza', '💄', 6),
  ('Navidad', 'navidad', '🎄', 7);

-- Precios de la tienda: lista (público) y mayorista, calculados desde el costo o cargados a mano.
ALTER TABLE products ADD COLUMN cost bigint;
ALTER TABLE products ADD COLUMN list_price bigint;
ALTER TABLE products ADD COLUMN wholesale_price bigint;
ALTER TABLE products ADD COLUMN price_mode text NOT NULL DEFAULT 'margin' CHECK (price_mode IN ('margin', 'manual'));
-- Márgenes propios del producto; vacíos = los generales de la tienda.
ALTER TABLE products ADD COLUMN list_margin numeric(6,2);
ALTER TABLE products ADD COLUMN wholesale_margin numeric(6,2);
ALTER TABLE products ADD COLUMN category_id int REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN featured boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN slug text;
ALTER TABLE products ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- Los productos que ya existían conservan sus precios tal cual.
UPDATE products SET list_price = suggested_price, wholesale_price = price, price_mode = 'manual';
UPDATE products p SET category_id = c.id FROM categories c WHERE lower(p.category) = lower(c.name);
UPDATE products SET slug = trim(both '-' from regexp_replace(
  translate(lower(name || ' ' || sku), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'));
CREATE UNIQUE INDEX products_slug ON products(slug);
CREATE INDEX products_category_id ON products(category_id);

CREATE TABLE banners (
  id          serial PRIMARY KEY,
  image_url   text NOT NULL,
  link        text,
  title       text,
  subtitle    text,
  position    int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
('store', '{
  "name": "VM Bazar y Deco",
  "tagline": "Bazar, cocina, deco y organización para tu casa",
  "margins": { "list": 65, "wholesale": 50 },
  "rounding": 100,
  "whatsapp": "",
  "whatsappMessage": "¡Hola! Quería hacer una consulta.",
  "contact": { "phone": "", "email": "", "address": "", "city": "", "hours": "" },
  "social": { "instagram": "", "facebook": "", "tiktok": "" },
  "payments": { "mercadopago": true, "cards": true, "transfer": true, "cash": true },
  "carouselSeconds": 5,
  "dispatchNote": "Los pedidos se despachan de 1 a 3 días hábiles.",
  "seo": {
    "title": "VM Bazar y Deco | Bazar, cocina, deco y organización",
    "description": "Tienda online de bazar y decoración: cocina, baño, deco, organización, limpieza, belleza y navidad. Envíos y precios mayoristas."
  }
}'),
('theme', '{
  "light": {
    "primary": "#2f7fa6", "onPrimary": "#ffffff", "primarySoft": "#e2f2f9",
    "accent": "#8e7cc3", "accentSoft": "#efebf8",
    "bg": "#f6f7f9", "surface": "#ffffff", "text": "#3d424d", "textSoft": "#6b7280", "line": "#e2e5ea",
    "footerBg": "#3d424d", "footerText": "#f1f2f5"
  },
  "dark": {
    "primary": "#7cc6e6", "onPrimary": "#10232c", "primarySoft": "#1d3440",
    "accent": "#b4a6e0", "accentSoft": "#2b2740",
    "bg": "#15171c", "surface": "#1e2128", "text": "#e6e8ec", "textSoft": "#a2a8b4", "line": "#30343d",
    "footerBg": "#0f1115", "footerText": "#d4d7de"
  },
  "fonts": {
    "brand": { "family": "Cormorant Garamond", "url": "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&display=swap" },
    "title": { "family": "Montserrat", "url": "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap" },
    "body": { "family": "Quicksand", "url": "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" },
    "banner": { "family": "Playfair Display", "url": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&display=swap" },
    "bannerSub": { "family": "Roboto Condensed", "url": "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;600&display=swap" }
  }
}')
ON CONFLICT (key) DO NOTHING;
