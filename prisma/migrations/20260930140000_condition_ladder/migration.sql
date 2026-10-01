-- Normaliza `Game.condition` a la escalera cerrada de `src/lib/conditions.ts`.
--
-- El campo sigue siendo TEXT (no hay cambio de tipo: `Game.condition` continues
-- siendo una cadena nullable), pero ya no se escriben etiquetas sueltas: lo que
-- se guarda es la clave de la escalera (NEW / LIKE_NEW / GOOD / ...) y la etiqueta
-- se resuelve al pintar. Esta migración es solo de DATOS.
--
-- Antes de escribirla se auditó la tabla y estos son los 17 valores que había, en
-- 6 escrituras para 4 conceptos distintos ('Buen estado' y 'Buen Estado' suman
-- 12 de las 17 filas). Se comparan en minúsculas y sin espacios para que el
-- resultado no dependa de cómo se escribió:
--
--   'Nuevo', 'Sellado'            -> NEW
--   'Como Nuevo', 'Como nuevo'     -> LIKE_NEW
--   'Buen estado', 'Buen Estado'   -> GOOD
--
-- Lo que no esté en esa lista se deja como está a propósito (la columna es texto
-- y `conditionLabel` lo pinta tal cual): una migración no debe inventarse el
-- estado de un dato que no conoce, ni borrarlo.

UPDATE "Game"
SET "condition" = CASE lower(btrim("condition"))
  WHEN 'nuevo' THEN 'NEW'
  WHEN 'sellado' THEN 'NEW'
  WHEN 'como nuevo' THEN 'LIKE_NEW'
  WHEN 'buen estado' THEN 'GOOD'
  ELSE "condition"
END
WHERE "condition" IS NOT NULL;
