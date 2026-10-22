-- Reclamos por falla de fábrica (no por rotura): la vendedora reporta con foto dentro del plazo,
-- administración aprueba (cambio en la próxima entrega o saldo a favor) o rechaza con motivo.
ALTER TABLE orders ADD COLUMN closed_at timestamptz; -- cierre del kit (segunda visita): desde ahí corre el plazo de reclamo

CREATE TABLE claims (
  id            serial PRIMARY KEY,
  seller_id     int NOT NULL REFERENCES sellers(user_id),
  order_id      int NOT NULL REFERENCES orders(id),
  order_item_id int NOT NULL REFERENCES order_items(id),
  qty           int NOT NULL CHECK (qty > 0),
  description   text NOT NULL,
  photo_url     text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'resolved', 'rejected')),
  resolution    text CHECK (resolution IN ('replace', 'credit')),
  amount        bigint NOT NULL DEFAULT 0, -- valor de lo reclamado (precio a vendedora)
  admin_note    text,
  resolved_by   int REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX claims_status_idx ON claims (status);
CREATE INDEX claims_seller_idx ON claims (seller_id);

INSERT INTO settings (key, value) VALUES ('claims', '{"windowDays": 7}') ON CONFLICT (key) DO NOTHING;
