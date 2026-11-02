-- Envío por código postal: se guarda el CP y la distancia calculada en cada pedido.
ALTER TABLE web_orders ADD COLUMN postal_code text;
ALTER TABLE web_orders ADD COLUMN distance_km numeric(6, 1);
