-- Fotos guardadas en la base de datos: así no dependen de un disco (el plan gratis de Render no tiene).
CREATE TABLE images (
  name       text PRIMARY KEY,
  mime       text NOT NULL,
  data       bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
