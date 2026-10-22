-- Catálogo: foto, descripción y categoría por producto.
ALTER TABLE products ADD COLUMN description text;
ALTER TABLE products ADD COLUMN category text;
ALTER TABLE products ADD COLUMN image_url text;
ALTER TABLE products ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX products_category ON products(category);
