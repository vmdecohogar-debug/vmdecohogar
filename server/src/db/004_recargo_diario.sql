-- Recargo por mora diario en vez de un porcentaje fijo: desde el día de recargo se cobra un % por cada día
-- de atraso (contando desde el vencimiento), con un tope.
UPDATE settings
   SET value = (value - 'surchargePct') || '{"surchargeDailyPct": 0.5, "surchargeMaxPct": 15}'::jsonb
 WHERE key = 'mora';
