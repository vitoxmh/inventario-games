# Manual de uso — Iven (GameVault)

SaaS de inventario para coleccionistas de videojuegos. Este documento describe, en orden de uso real, cómo funciona la aplicación: acceso, roles, inventario, estadísticas, planes y facturación.

Rutas de ejemplo con el idioma por defecto (`es`). La app también soporta `en`.

---

## 1. Acceso a la aplicación

### Registro
1. Ve a `/es/signup`.
2. Introduce un **email** y una **contraseña**.
3. Recibirás un **correo de verificación** (se envía con Resend).
4. Pulsa el enlace del correo → verás "¡Correo verificado! Ya puedes iniciar sesión.".
5. **No puedes iniciar sesión hasta verificar el correo** (`emailVerifiedAt` en BD). Si el correo no llega, usa el botón de *reenviar verificación* en la página de login/registro.

### Iniciar sesión
- `/es/login` con **email + contraseña**, ó con **Google** (botón "Continuar con Google" sólo se muestra si en `.env` están `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`).
- Al iniciar sesión con Google se crea la cuenta automáticamente si no existe (adopta el mismo email si la cuenta de email ya existía).

### Cuenta suspendida
- Si un administrador banea la cuenta (`bannedAt`), la sesión queda invalidada y, al intentar entrar, se muestra la página `/es/suspended`.
- El baneo se comprueba en cada login y en cada `requireAdmin()`.

---

## 2. Roles

Todos los usuarios empiezan con `role: "user"`. No hay registro de administradores por la UI.

### Cómo se es administrador
El mecanismo es por lista de emails en la variable de entorno `ADMIN_EMAILS` (separada por comas, no sensible a mayúsculas). Cuando un usuario de esa lista inicia sesión (o un admin hace `requireAdmin()`), se **promueve automáticamente a `role: "admin"`** en el siguiente request.

Pasos para entrar como admin:
1. Añadir tu email a `ADMIN_EMAILS` en el `.env`.
2. Reiniciar el dev server (las variables de entorno se leen al arrancar).
3. Entrar con ese email vía registro/login normal.
4. En el menú de usuario (avatar) aparecerá el item **"Admin"** → lleva a `/es/admin/users`.

> Estado actual: `ADMIN_EMAILS` ya está en el `.env`, pero **no contiene ningún email real**. Hasta que se ponga uno, nadie es admin.

### Panel de administración (`/es/admin`)
- **Usuarios** (`/es/admin/users`): lista, promoción/revocación de admin, suspensión/activación.
- **Juegos** (`/es/admin/games`): catálogo global de juegos.
- **Suscripciones** (`/es/admin/subscriptions`): estado de las suscripciones.

---

## 3. Inventario (`/es/app`)

Sección principal. Muestra el total de juegos y, si el plan tiene límite, `N / límite`.

### Añadir un juego
Botón **"Añadir juego"**:
- Por **búsqueda RAWG**: escribe un título, se consulta `RAWG_API_KEY` y se puede elegir un resultado (portada y datos autocompletados).
- Manualmente: título, plataforma, género, estado, condición, precio, fecha de compra, horas jugadas y notas.

### Estados posibles
| Clave | Etiqueta (es) |
|---|---|
| OWNED | En colección |
| SEALED | Sellado |
| CIB | Completo (CIB) |
| LOOSE | Suelto |
| DIGITAL | Digital |
| WISHLIST | Deseado |
| SELLING | En venta |

### Por juego
En la tarjeta (menú de 3 puntos): **Editar** (abre el diálogo y persiste hasta que lo cierres), **Eliminar** (pide confirmación) y el **cambio de estado** (checkbox del menú). El botón de estado también está disponible como botón directo en la tarjeta.

### Límites por plan
| Plan | Juegos |
|---|---|
| FREE | 25 |
| PRO | 500 |
| COLLECTOR | Ilimitado |

Al alcanzar el límite el alta se rechaza (se puede cambiar de plan para seguir añadiendo).

---

## 4. Estadísticas (`/es/app/stats`)

Resumen de tu colección:
- **Total de juegos**, **valor total**, **valor medio** y **horas totales** jugadas.
- Desglose **por estado**, **por plataforma** y **por género** (top).
- **Destacados**: el juego más caro y el número de juegos *sellados*.

---

## 5. Planes y facturación (`/es/app/billing`)

Ahí se cambia de plan. La página muestra tu **plan actual**, el **uso** (contador sobre el límite con barra) y el estado de la suscripción.

### Sin suscripción activa
Se muestran las tarjetas de los planes de pago:
- **PRO — 4,99 $/mes**
- **COLLECTOR — 9,99 $/mes**

Botón **"Suscribirse a PRO / Suscribirse a COLLECTOR"** → `POST /api/billing/checkout` → redirige a la pasarela (Stripe Checkout o MercadoPago, según el proveedor elegido). Al volver, `?checkout=success` o `?checkout=canceled` muestran un aviso en la página.

### Con suscripción activa
Botón **"Gestionar suscripción"** → `POST /api/billing/portal` → abre el **portal de cliente de Stripe**, donde se puede **cambiar de plan, actualizar la tarjeta y cancelar**. El estado (ACTIVE/PAST_DUE/CANCELED/TRIALING/INACTIVE) se refleja tras procesar el webhook.

### Notas para revisión
- Los precios y proveedores salen de las variables de entorno (`.env`): actualmente **faltan las credenciales de pago** (`STRIPE_SECRET_KEY` + `STRIPE_PRICE_PRO`/`STRIPE_PRICE_COLLECTOR`, o `MP_ACCESS_TOKEN` + `MP_PREAPPROVAL_*`). Sin ellas:
  - La página muestra "Stripe no configurado" y no aparecen botones de pago.
  - `POST /api/billing/checkout` y `/api/billing/portal` responden `503 provider_not_available`.
- El plan de un usuario sólo cambia vía webhook de pago (o a mano en BD). Los límites están en `src/lib/plans.ts`.

---

## 6. Cuenta (`/es/app/account`)

- Muestra el **email** y el **plan** actual.
- Botón **"Cerrar sesión"** (o el item "Cerrar sesión" en el menú del avatar).

---

## 7. Resumen del estado actual (para revisión)

| Tema | Estado |
|---|---|
| Registro + verificación de correo | Funciona (requiere `RESEND_API_KEY`, ya configurada) |
| Login email/contraseña y Google | Funciona |
| Administradores (`ADMIN_EMAILS`) | Mecanismo listo; **falta poner un email real** |
| CRUD de inventario + estados | Funciona |
| Estadísticas | Funciona |
| Planes / cambiar de plan | **Requerir credenciales de pago** para activar checkout/portal |