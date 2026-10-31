# VM Bazar y Deco · Red de vendedoras

Plataforma para gestionar una red de revendedoras: kit de arranque en consignación, pedidos abiertos con cupo de crédito por nivel de confianza, descuento por pago anticipado, referidas en dos niveles con comisiones, jefas zonales, recordatorios y alertas de mora por WhatsApp.

Diseño funcional completo: https://claude.ai/artifact/Vm8emL9jTfsDy1NtnQZGdC

## Estructura

```
server/   API en Node.js + Express + PostgreSQL
  src/rules/      reglas de negocio puras (cupos, descuentos, mora, comisiones, niveles)
  src/services/   lógica con base de datos (altas, pedidos, kit, pagos, proceso diario, liquidaciones, WhatsApp)
  src/db/         migraciones SQL, datos iniciales y red de ejemplo
  test/           pruebas (reglas y flujo completo contra PostgreSQL)
web/      Frontend en React + Vite, responsive (celular primero), con la paleta del logo
  src/theme.css   colores de la marca: cambiarlos acá cambia toda la app
```

## Cómo correrlo en tu compu

Necesitás Node.js 20 o más y PostgreSQL 14 o más.

```bash
npm run install:all
createdb redvendedora
cp server/.env.example server/.env      # completá los valores
cd server && npm run seed               # crea las tablas, el usuario admin y productos de ejemplo
npm run demo                            # opcional: carga una red de ejemplo para probar
cd ..
npm run dev:server                      # API en http://localhost:3001
npm run dev:web                         # app en http://localhost:5173
```

Usuarios de la red de ejemplo (`npm run demo`):

| Rol | Celular | Contraseña |
| --- | --- | --- |
| Administración | 11 0000 0000 | admin123 |
| Jefa zonal (Ana) | 11 5000 0001 | demo123 |
| Vendedora en mora (Carla) | 11 5000 0003 | demo123 |

Cambiá la contraseña del admin (`ADMIN_PASSWORD`) antes de usarlo de verdad.

## Pruebas

```bash
cd server
npm test                                                   # reglas de negocio
TEST_DATABASE_URL=postgres://localhost/redvendedora_test npm test   # además, el flujo completo con base real
```

## Publicar en Render

El archivo `render.yaml` deja todo listo para [Render](https://render.com):

1. Creá una cuenta en Render entrando con GitHub.
2. En el panel, **New > Blueprint**, elegí este repositorio y tocá **Apply**.
3. Render pide `ADMIN_PHONE` (tu celular, por ejemplo 1144445555) y `ADMIN_PASSWORD` (la contraseña del admin). Con eso crea el usuario de administración la primera vez.
4. En unos minutos la app queda en `https://vmdecohogar.onrender.com` (o el nombre que te asigne Render).

Crea tres cosas, con costo mensual aproximado en dólares (precios de Render a octubre de 2026):

| Recurso | Plan | Costo |
| --- | --- | --- |
| App web (API y página) | 0.5c-512mb | USD 7 |
| Base de datos PostgreSQL | 0.1c-256mb | USD 6 |
| Disco de 1 GB para fotos | — | USD 0,25 |

El plan gratis de Render no sirve para esto: no admite disco para las fotos y la base gratis se borra a los 30 días. Cada vez que subís cambios a `main`, Render vuelve a publicar solo.

Fuera de Render: `npm --prefix server ci && npm --prefix web ci --include=dev && npm --prefix web run build`, después `npm --prefix server run seed && npm --prefix server start`. El servidor sirve la API y la app en el mismo puerto. El proceso diario (recordatorios, mora, recargos, alertas) corre solo a las 10 h; si preferís un cron externo, poné `DAILY_JOB=off` y programá `npm --prefix server run daily`. En producción (`NODE_ENV=production`) el admin solo se crea si definís `ADMIN_PASSWORD`, y con `SEED_SAMPLE_PRODUCTS=false` no se cargan los productos de ejemplo.

## Publicar gratis (Render + Neon)

Para probar sin pagar: la app en el plan gratis de Render y la base en el plan gratis de Neon (no vence).
Las fotos se guardan en la base, así que no hace falta disco.

1. **Neon** (neon.tech): crear un proyecto (región São Paulo) y copiar la *connection string* (`postgresql://…?sslmode=require`).
2. **Render** → New → Web Service → este repositorio, rama `main`, instancia **Free**:
   - Build: `npm --prefix server ci && npm --prefix web ci --include=dev && npm --prefix web run build`
   - Start: `npm --prefix server run seed && npm --prefix server start`
   - Health check: `/api/health`
   - Variables: `NODE_VERSION=22`, `NODE_ENV=production`, `DATABASE_URL` (la de Neon), `JWT_SECRET` (texto largo al azar),
     `ADMIN_PHONE`, `ADMIN_PASSWORD`, `SEED_SAMPLE_PRODUCTS=false`, `WHATSAPP_PROVIDER=simulated`.
3. **Despierta**: el plan gratis se duerme a los 15 minutos sin visitas (la primera carga tarda ~1 minuto) y así no corre
   el proceso diario de recordatorios y mora. Un ping gratis cada 10 minutos a `/api/health` (por ejemplo, cron-job.org) lo mantiene despierto.

## Tienda online

La dirección principal (`/`) es la tienda pública de VM Bazar y Deco; el panel está en `/admin` (se entra por `/ingresar`).

- **Tienda**: buscador, barra de categorías con íconos, carrusel de banners con link, Más vendidos / Lo nuevo (8 productos cada uno), 3 categorías al azar, ficha de producto, carrito, contacto, pie con medios de pago, redes y contacto, botón flotante de WhatsApp y modo oscuro.
- **Precios**: cada producto tiene costo y se calcula solo con los márgenes generales (65% lista, 50% mayorista, redondeo a $100, todo editable en Tienda) o con márgenes propios; también se puede poner el precio a mano. El costo nunca se muestra al público y el precio mayorista solo a cuentas mayoristas.
- **Panel**: Productos, Categorías (agregar, editar, ordenar, borrar), Banners, Apariencia (12 colores por uso para modo claro y oscuro, tipografías por enlace de Google Fonts) y Tienda (márgenes, WhatsApp, contacto, redes, medios de pago, SEO).
- **Compra**: carrito con precios del servidor, zona de envío con su costo, pago con Mercado Pago (Checkout Pro, necesita `MP_ACCESS_TOKEN`) o transferencia (alias/CBU y botón para mandar el comprobante por WhatsApp con un mensaje corto que solo dice el número de pedido). Cada pedido guarda nombre, teléfono, dirección, precios y costo de cada producto. Al confirmar se avisa que se despacha de 1 a 3 días hábiles.
- **Mayoristas**: se registran en `/mayoristas` (quedan pendientes hasta aprobarlos), con el enlace de invitación del panel (quedan habilitados al instante) o los da de alta administración. Ven y pagan el precio mayorista en toda la tienda.
- **Catálogo inicial**: `server/catalogo/` tiene los 256 productos del PDF de precios (nombre, descripción, categoría, costo, precio ×1,50 mayorista y ×1,65 lista, tal cual el PDF) con sus fotos. `npm run seed` los carga una sola vez en la base (fotos incluidas); con `LOAD_CATALOG=false` no se cargan. Los productos con dos medidas quedan como dos productos (VM-021-1 y VM-021-2).
- **SEO**: el servidor completa título, descripción, vista previa para redes y datos de producto para Google en cada página, y publica `/sitemap.xml` y `/robots.txt`.

## Catálogo

En **Catálogo** (panel de administración) se cargan los productos con foto, categoría, descripción, precio a vendedora, precio sugerido y stock, y se pausan los que no están disponibles. Para cargar muchos de una vez, **Importar lista** acepta:

- texto copiado de WhatsApp, una línea por producto: `Vela de soja 200 g $4.800 / $6.900` (primer precio = vendedora, segundo = sugerido);
- una planilla o CSV con columnas `Nombre; Precio; Sugerido; Stock; Categoría; Descripción; Código`.

Antes de importar muestra una vista previa con lo que se crea, lo que se actualiza (mismo código o mismo nombre) y las líneas con errores. Las fotos se achican en el celular antes de subirse y se guardan en `UPLOADS_DIR`.

## Reglas configurables

Desde **Ajustes** en el panel de administración:

- Niveles: cupo, plazo de pago, descuento por pagar antes de recibir y pedidos sin mora para subir (Bronce $75.000 / 7 días, Plata $125.000 / 10 días, Oro $200.000 / 15 días, 5%).
- Kit de arranque: hasta 10 productos o $50.000; pregunta por cambios a los 5 días.
- Comisiones: 3% referidas directas, 1% segundo nivel, desde 5 activas; jefa zonal con 10.
- Mora: recordatorio 3 días antes; desde el día 4 de atraso alerta a la jefa zonal, recargo (3% por defecto) y bloqueo de pedidos; día 7 alerta a administración; día 15 baja un nivel; día 30 vuelve a Inicial y queda como posible incobrable.

## Integraciones

- **WhatsApp**: por defecto los mensajes se guardan como "simulados" y se ven en Alertas. Para enviarlos de verdad, creá una cuenta en WhatsApp Business Platform (Meta), aprobá las plantillas de `server/src/services/whatsapp.js` con esos mismos nombres y completá `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
- **Mercado Pago**: con `MP_ACCESS_TOKEN` los links de pago abren Checkout Pro y los pagos aprobados se acreditan solos por webhook (`/api/webhooks/mercadopago`). Sin token, las vendedoras avisan transferencias y administración confirma. Esta integración no se probó todavía contra Mercado Pago real.
- **Facturación ARCA**: no incluida en este MVP (ver etapa 3 del diseño).
