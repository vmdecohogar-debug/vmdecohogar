-- Primera vez que la vendedora entra: se le muestra la bienvenida hasta que la termina o la saltea.
ALTER TABLE users ADD COLUMN onboarded_at timestamptz;
-- Las cuentas que ya existían no la ven.
UPDATE users SET onboarded_at = now() WHERE status = 'active';
