-- Recargo por mora diario en vez de un porcentaje fijo: se cobra un % por cada día de atraso
-- contado desde el día de recargo (los días de margen no suman), con un tope.
UPDATE settings
   SET value = (value - 'surchargePct') || '{"surchargeDailyPct": 0.5, "surchargeMaxPct": 15}'::jsonb
 WHERE key = 'mora';
