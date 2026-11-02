-- Descuentos por producto: el admin pone un % y la tienda muestra el precio anterior tachado y el promocional.
-- list_price / wholesale_price siguen siendo los precios normales; los promocionales se guardan aparte
-- (ya redondeados) para poder ordenar y cobrar con ellos. Sin descuento quedan en NULL.
ALTER TABLE products ADD COLUMN discount_pct numeric(5,2) CHECK (discount_pct > 0 AND discount_pct < 100);
ALTER TABLE products ADD COLUMN promo_list_price bigint;
ALTER TABLE products ADD COLUMN promo_wholesale_price bigint;
