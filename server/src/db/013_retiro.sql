-- Retiro sin costo en un punto de entrega: el pedido queda marcado para no confundirlo con un envío.
ALTER TABLE web_orders ADD COLUMN pickup boolean NOT NULL DEFAULT false;
