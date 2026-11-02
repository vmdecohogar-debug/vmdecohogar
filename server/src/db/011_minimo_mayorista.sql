-- Compra mínima mayorista, productos sin stock y banners con imagen propia para celular.

-- Mayoristas a los que administración les saca el mínimo de compra.
ALTER TABLE users ADD COLUMN no_minimum boolean NOT NULL DEFAULT false;

-- Producto sin stock: se sigue viendo en la tienda, pero no se puede agregar al carrito.
ALTER TABLE products ADD COLUMN out_of_stock boolean NOT NULL DEFAULT false;

-- Imagen opcional para celular (si no hay, el celular muestra la de computadora).
ALTER TABLE banners ADD COLUMN mobile_image_url text;

-- Mínimo de compra mayorista: $50.000 (en centavos), sin contar el envío.
UPDATE settings SET value = value || '{"minOrder": 5000000}'::jsonb WHERE key = 'wholesale' AND NOT (value ? 'minOrder');
INSERT INTO settings (key, value) VALUES ('wholesale', '{"inviteCode": null, "requireApproval": true, "minOrder": 5000000}')
ON CONFLICT (key) DO NOTHING;
