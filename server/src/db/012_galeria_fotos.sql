-- Fotos extra por producto (galería). La principal sigue en products.image_url; acá van las demás, en orden.
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_images text[] NOT NULL DEFAULT '{}';
