-- Compras en la tienda: clientes mayoristas, zonas de envío y pedidos web.

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'seller', 'wholesale'));
ALTER TABLE users ADD COLUMN business text;   -- nombre del comercio (mayoristas)
ALTER TABLE users ADD COLUMN city text;

CREATE TABLE shipping_zones (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  description text,
  price       bigint NOT NULL DEFAULT 0 CHECK (price >= 0),
  position    int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);
-- Zonas de ejemplo: se cambian desde el panel (Envíos).
INSERT INTO shipping_zones (name, description, price, position) VALUES
  ('Zona cercana', 'Ejemplo: editá nombre, localidades y precio', 300000, 1),
  ('Zona lejana', 'Ejemplo: editá nombre, localidades y precio', 600000, 2);

CREATE TABLE web_orders (
  id              serial PRIMARY KEY,
  public_token    text NOT NULL UNIQUE,           -- para que el cliente vea su pedido sin cuenta
  user_id         int REFERENCES users(id),
  customer_name   text NOT NULL,
  phone           text NOT NULL,
  address         text NOT NULL,
  city            text,
  notes           text,
  zone_id         int REFERENCES shipping_zones(id) ON DELETE SET NULL,
  zone_name       text NOT NULL,
  shipping        bigint NOT NULL DEFAULT 0,
  subtotal        bigint NOT NULL,
  total           bigint NOT NULL,
  cost_total      bigint NOT NULL DEFAULT 0,      -- costo de la mercadería (para la ganancia)
  price_type      text NOT NULL CHECK (price_type IN ('list', 'wholesale')),
  payment_method  text NOT NULL CHECK (payment_method IN ('mercadopago', 'transfer')),
  payment_status  text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'proof_sent', 'paid', 'rejected')),
  status          text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'ready', 'delivered', 'cancelled')),
  mp_payment_id   text UNIQUE,
  paid_at         timestamptz,
  ready_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_orders_status ON web_orders(status, created_at);

CREATE TABLE web_order_items (
  id          serial PRIMARY KEY,
  order_id    int NOT NULL REFERENCES web_orders(id) ON DELETE CASCADE,
  product_id  int REFERENCES products(id),
  sku         text,
  name        text NOT NULL,
  qty         int NOT NULL CHECK (qty > 0),
  unit_price  bigint NOT NULL,
  unit_cost   bigint
);

INSERT INTO settings (key, value) VALUES
('checkout', '{
  "mercadopago": true,
  "transfer": true,
  "transferInfo": { "alias": "", "cbu": "", "holder": "", "bank": "" },
  "whatsappOrderMessage": "¡Hola! Acabo de realizar un pedido por la página (pedido #{pedido}). Ya te envío el comprobante."
}'),
('wholesale', '{ "inviteCode": null, "requireApproval": true }')
ON CONFLICT (key) DO NOTHING;
