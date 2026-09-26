-- Registro de las orders de Mercado Pago creadas por el checkout.
--
-- MP no deja LISTAR los pagos de un usuario: `GET /v1/orders/search` responde 400
-- con el token que tenemos y la URL de retorno no trae el `order_id`. La unica
-- forma de volver a una order es recordar su id, asi que se guarda aqui.
-- Sin esta tabla, un pago que el webhook no llego a resolver es irrecuperable.
--
-- `order_id` es el id que devuelve MP (`ORD...`) y es unico: si MP devolviera un id
-- repetido, el upsert de la ruta de checkout no crearia una segunda fila.
--
-- `status` es el ultimo desenlace conocido de la order (pending|paid|dead), no el
-- estado de la suscripcion del usuario (ese vive en User.subscription_status).
-- `pending` significa "todavia sin resolver" y es lo que liquida la pagina de
-- facturacion al abrirse.
--
-- ON DELETE CASCADE en user_id: al borrar un usuario se van sus orders con el,
-- igual que sus juegos.
CREATE TABLE "MpCheckout" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MpCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MpCheckout_orderId_key" ON "MpCheckout"("orderId");

CREATE INDEX "MpCheckout_userId_status_idx" ON "MpCheckout"("userId", "status");

CREATE INDEX "MpCheckout_status_createdAt_idx" ON "MpCheckout"("status", "createdAt");

ALTER TABLE "MpCheckout"
ADD CONSTRAINT "MpCheckout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
