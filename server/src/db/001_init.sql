-- Montos en centavos de peso (bigint) para evitar errores de redondeo.

CREATE TABLE levels (
  code                 text PRIMARY KEY,
  name                 text NOT NULL,
  rank                 int  NOT NULL UNIQUE,
  credit_limit         bigint NOT NULL,
  term_days            int  NOT NULL,
  early_discount_pct   numeric(5,2) NOT NULL DEFAULT 0,
  -- pedidos a crédito pagados seguidos sin mora mayor a 3 días para llegar a este nivel
  required_clean_orders int NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE zones (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  locality  text,
  leader_id int
);

CREATE TABLE users (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  dni                text UNIQUE,
  phone              text NOT NULL UNIQUE,
  email              text,
  address            text,
  password_hash      text NOT NULL,
  role               text NOT NULL CHECK (role IN ('admin', 'seller')),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'inactive')),
  whatsapp_opt_in_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sellers (
  user_id               int PRIMARY KEY REFERENCES users(id),
  referral_code         text NOT NULL UNIQUE,
  referred_by           int REFERENCES sellers(user_id),
  zone_id               int REFERENCES zones(id),
  level_code            text NOT NULL DEFAULT 'inicial' REFERENCES levels(code),
  credit_limit_override bigint,
  clean_streak          int NOT NULL DEFAULT 0,
  is_leader             boolean NOT NULL DEFAULT false,
  leader_since          timestamptz,
  balance_credit        bigint NOT NULL DEFAULT 0
);
CREATE INDEX sellers_referred_by ON sellers(referred_by);

ALTER TABLE zones ADD FOREIGN KEY (leader_id) REFERENCES sellers(user_id);

CREATE TABLE products (
  id              serial PRIMARY KEY,
  sku             text NOT NULL UNIQUE,
  name            text NOT NULL,
  price           bigint NOT NULL,
  suggested_price bigint NOT NULL,
  stock           int NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id            serial PRIMARY KEY,
  seller_id     int NOT NULL REFERENCES sellers(user_id),
  kind          text NOT NULL CHECK (kind IN ('kit', 'regular')),
  -- prepaid: paga antes de recibir (con descuento); on_delivery: contra entrega;
  -- credit: a plazo dentro del cupo; consignment: kit de arranque
  payment_mode  text NOT NULL CHECK (payment_mode IN ('prepaid', 'on_delivery', 'credit', 'consignment')),
  status        text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'delivered', 'settled', 'cancelled')),
  subtotal      bigint NOT NULL,
  discount      bigint NOT NULL DEFAULT 0,
  balance_applied bigint NOT NULL DEFAULT 0,
  total         bigint NOT NULL,
  credit_part   bigint NOT NULL DEFAULT 0,
  upfront_part  bigint NOT NULL DEFAULT 0,
  delivery_date date NOT NULL,
  deliver_to    text NOT NULL DEFAULT 'seller' CHECK (deliver_to IN ('seller', 'leader')),
  delivered_at  timestamptz,
  -- kit: cambios que pide la vendedora antes de la segunda visita
  change_request jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_seller ON orders(seller_id);

CREATE TABLE order_items (
  id           serial PRIMARY KEY,
  order_id     int NOT NULL REFERENCES orders(id),
  product_id   int NOT NULL REFERENCES products(id),
  qty          int NOT NULL CHECK (qty > 0),
  unit_price   bigint NOT NULL,
  returned_qty int NOT NULL DEFAULT 0
);

-- Obligación de pago: lo que la vendedora debe por un pedido.
CREATE TABLE obligations (
  id                serial PRIMARY KEY,
  order_id          int NOT NULL REFERENCES orders(id),
  seller_id         int NOT NULL REFERENCES sellers(user_id),
  kind              text NOT NULL CHECK (kind IN ('upfront', 'on_delivery', 'credit')),
  amount            bigint NOT NULL,
  surcharge         bigint NOT NULL DEFAULT 0,
  paid_principal    bigint NOT NULL DEFAULT 0,
  paid_surcharge    bigint NOT NULL DEFAULT 0,
  due_date          date,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'bad_debt', 'cancelled')),
  max_days_late     int NOT NULL DEFAULT 0,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX obligations_seller ON obligations(seller_id, status);

CREATE TABLE payments (
  id            serial PRIMARY KEY,
  obligation_id int NOT NULL REFERENCES obligations(id),
  seller_id     int NOT NULL REFERENCES sellers(user_id),
  amount        bigint NOT NULL CHECK (amount > 0),
  principal     bigint NOT NULL DEFAULT 0,
  method        text NOT NULL CHECK (method IN ('mercadopago', 'cash', 'transfer')),
  -- reported: informado (efectivo en manos de la jefa o comprobante); credited: acreditado
  status        text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'credited', 'rejected')),
  external_ref  text UNIQUE,
  collected_by  int REFERENCES users(id),
  credited_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlements (
  id             serial PRIMARY KEY,
  beneficiary_id int NOT NULL REFERENCES sellers(user_id),
  period         text NOT NULL,
  total          bigint NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  method         text CHECK (method IN ('balance', 'transfer')),
  paid_at        timestamptz,
  UNIQUE (beneficiary_id, period)
);

CREATE TABLE commissions (
  id             serial PRIMARY KEY,
  beneficiary_id int NOT NULL REFERENCES sellers(user_id),
  payment_id     int NOT NULL REFERENCES payments(id),
  tier           int NOT NULL CHECK (tier IN (1, 2)),
  base           bigint NOT NULL,
  pct            numeric(5,2) NOT NULL,
  amount         bigint NOT NULL,
  period         text NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'void')),
  settlement_id  int REFERENCES settlements(id),
  UNIQUE (payment_id, tier)
);

CREATE TABLE alerts (
  id            serial PRIMARY KEY,
  type          text NOT NULL,
  seller_id     int REFERENCES sellers(user_id),
  recipient_id  int REFERENCES users(id),
  obligation_id int REFERENCES obligations(id),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handled', 'closed')),
  note          text,
  dedupe_key    text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id           serial PRIMARY KEY,
  recipient_id int REFERENCES users(id),
  phone        text NOT NULL,
  template     text NOT NULL,
  vars         jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL CHECK (status IN ('sent', 'simulated', 'failed', 'skipped')),
  provider_id  text,
  error        text,
  dedupe_key   text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id         serial PRIMARY KEY,
  actor_id   int REFERENCES users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  int,
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO levels (code, name, rank, credit_limit, term_days, early_discount_pct, required_clean_orders) VALUES
  ('inicial', 'Inicial', 0, 0,          0, 0, 0),
  ('bronce',  'Bronce',  1, 7500000,    7, 5, 0),
  ('plata',   'Plata',   2, 12500000,  10, 5, 3),
  ('oro',     'Oro',     3, 20000000,  15, 5, 6);

INSERT INTO settings (key, value) VALUES
  ('kit',          '{"maxUnits": 10, "maxAmount": 5000000, "followUpDays": 5}'),
  ('commissions',  '{"tier1Pct": 3, "tier2Pct": 1, "minActiveToEarn": 5, "minActiveForLeader": 10, "activeWindowDays": 30}'),
  ('mora',         '{"reminderDaysBefore": 3, "leaderAlertDay": 4, "surchargeDay": 4, "surchargePct": 3, "blockDay": 4, "adminAlertDay": 7, "levelDownDay": 15, "badDebtDay": 30, "lateToleranceDays": 3}'),
  ('delivery',     '{"minBusinessDays": 1, "maxBusinessDays": 3}');
