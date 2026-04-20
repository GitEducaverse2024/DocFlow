---
id: architecture-holded-mcp-api
type: concept
subtype: api-reference
lang: es
title: "Holded MCP — API Reference"
summary: "Guía unificada de la API REST de Holded reorganizada para uso práctico de integración por terceros: 5 dominios, ~121 endpoints, flujo recomendado, convenciones."
tags: [holded, mcp, crm]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/holded-mcp-api.md (single architecture atom per Apéndice D §D2 long-file pattern)" }
ttl: never
---

# Holded MCP — API Reference

Guía unificada de la API REST de Holded, reorganizada para uso práctico de integración por terceros.

> Alcance: este documento consolida las URLs que me compartiste y las ordena por dominios funcionales. No se limita a reproducir cada endpoint: añade contexto de integración, orden recomendado de consumo, dependencias entre recursos, buenas prácticas y advertencias operativas.
>
> Nota de precisión: la gran mayoría de rutas y comportamientos se han tomado directamente de la documentación oficial. En unos pocos endpoints CRUD cuyo `.md` devolvió timeout puntual, la ruta se mantiene siguiendo el patrón oficial del mismo recurso y la nomenclatura de la colección.

---

## 1. Visión general

Holded expone varias familias de API REST bajo distintos prefijos:

- **Invoicing / Invoice API**: contactos, documentos, productos, pagos, almacenes, servicios, etc.
- **CRM API**: funnels, leads, eventos, bookings.
- **Projects API**: proyectos, tareas y partes de tiempo.
- **Team API**: empleados y fichajes / time tracking de empleados.
- **Accounting API**: libro diario y plan contable.

### URLs base

- `https://api.holded.com/api/invoicing/v1`
- `https://api.holded.com/api/crm/v1`
- `https://api.holded.com/api/projects/v1`
- `https://api.holded.com/api/team/v1`
- `https://api.holded.com/api/accounting/v1`

### Autenticación

Todas las peticiones deben ir por HTTPS y enviar la API key en cabecera:

```http
key: TU_API_KEY
Content-Type: application/json
```

### Convenciones importantes

- Los endpoints “list” están paginados. En la documentación general se indica el patrón `?page=2`.
- La mayoría de recursos usan IDs internos de Holded (`contactId`, `documentId`, `warehouseId`, etc.).
- En muchos flujos primero debes **resolver IDs** con un `GET list` y luego operar con el endpoint específico.
- Hay endpoints que mezclan JSON y binarios/multipart:
  - JSON estándar para CRUD.
  - `multipart/form-data` para adjuntos.
  - respuestas binarias o pseudo-binarias para PDFs e imágenes.
- Varias fechas vienen en **timestamp**.
- Algunas operaciones aceptan nombres exactos además de IDs (por ejemplo ciertos stages de CRM), pero para integraciones robustas conviene usar IDs.

---

## 2. Flujo recomendado para un tercero que va a integrar Holded

### 2.1. Orden práctico de integración

1. **Autenticación**: probar una llamada simple de lectura.
2. **Catálogos base**:
   - impuestos (`/taxes`)
   - métodos de pago (`/paymentmethods`)
   - series (`/numberingseries/{type}`)
   - canales de venta (`/saleschannels`)
   - almacenes (`/warehouses`)
3. **Maestros**:
   - contactos
   - grupos de contacto
   - productos / servicios
   - cuentas de gasto / tesorerías
4. **Operativa**:
   - documentos
   - pagos
   - stock
   - CRM
   - bookings
   - proyectos / tiempos
   - empleados / fichajes
5. **Contabilidad**:
   - libro diario
   - cuentas contables

### 2.2. Estrategia técnica recomendada

- Crear un **cliente HTTP por dominio** (invoicing, crm, projects, team, accounting).
- Centralizar:
  - API key
  - reintentos
  - gestión de `429/5xx`
  - normalización de timestamps
  - serialización JSON / multipart / binario
- Mantener una **capa de mapeo interno** entre tus IDs y los IDs de Holded.
- Guardar en caché catálogos poco cambiantes: impuestos, payment methods, numbering series, funnels, locations, services, etc.
- Antes de crear recursos, intentar deduplicar por campos funcionales: `customId`, `sku`, email, código fiscal, etc.

### 2.3. Plantilla base de llamada

```bash
curl --request GET \
  --url https://api.holded.com/api/invoicing/v1/contacts \
  --header 'key: TU_API_KEY' \
  --header 'Content-Type: application/json'
```

---

## 3. Invoice API

Base URL: `https://api.holded.com/api/invoicing/v1`

### 3.1. Treasuries

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/treasury` | Lista tesorerías/cuentas bancarias | Úsalo al arrancar para resolver `treasuryId` y no hardcodear cuentas. |
| POST | `/treasury` | Crea tesorería | Si `accountNumber` va vacío, Holded puede crear una cuenta contable 572 automáticamente. Buen endpoint para onboarding contable. |
| GET | `/treasury/{treasuryId}` | Obtiene una tesorería | Útil para validar que la tesorería seleccionada sigue activa antes de registrar cobros/pagos. |

**Consejo**: si tu sistema tiene varias cuentas bancarias o cajas, mapea internamente la cuenta externa → `treasuryId`.

### 3.2. Contacts

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/contacts` | Lista contactos | Soporta filtros útiles como `phone`, `mobile` y `customId`. Ideal para deduplicación previa. |
| POST | `/contacts` | Crea contacto | Puede crear empresa o persona; conviene enviar `customId` si vienes de un CRM o ERP externo. |
| GET | `/contacts/{contactId}` | Obtiene contacto | Paso previo antes de editar defaults, direcciones o personas de contacto. |
| PUT | `/contacts/{contactId}` | Actualiza contacto | Actualización parcial según campos enviados. Úsalo con payload mínimo para evitar sobrescribir defaults. |
| DELETE | `/contacts/{contactId}` | Elimina contacto | Mejor usarlo sólo si tu lógica de sincronización contempla borrado real y no archivado. |
| GET | `/contacts/{contactId}/attachments/list` | Lista adjuntos del contacto | Recomendado para sincronizar documentación documental o verificar si ya subiste un archivo. |
| GET | `/contacts/{contactId}/attachments/get?filename=...` | Descarga un adjunto del contacto | Necesitas `contactId` y el nombre exacto del archivo. |

**Campos muy útiles al crear/actualizar**:

- `customId`
- `type` (`supplier`, `debtor`, `creditor`, `client`, `lead`)
- `isperson`
- `groupId`
- `taxOperation`
- `defaults` (idioma, moneda, descuentos, pago, impuestos, etc.)
- `contactPersons`
- `shippingAddresses`
- `numberingSeries`

**Recomendación de integración**:

- Usa `customId` como ancla si Holded es sistema secundario.
- Usa `contactId` como ancla si Holded es sistema maestro.
- Si vas a emitir documentos, rellena bien los `defaults` del contacto para simplificar el alta de facturas/pedidos.

### 3.3. Expenses Accounts

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/expensesaccounts` | Lista cuentas de gasto | Útil para resolver `expensesAccountId` antes de asociar proveedores o defaults. |
| POST | `/expensesaccounts` | Crea cuenta de gasto | Requiere nombre, descripción y número contable. |
| GET | `/expensesaccounts/{expensesAccountId}` | Obtiene cuenta de gasto | Validación previa antes de asignarla a contactos o documentos. |
| PUT | `/expensesaccounts/{expensesAccountId}` | Actualiza cuenta de gasto | Mantén controlado el catálogo si lo replicas desde otro ERP. |
| DELETE | `/expensesaccounts/{expensesAccountId}` | Elimina cuenta de gasto | Usar con precaución porque puede impactar defaults existentes. |

### 3.4. Numbering Series

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/numberingseries/{type}` | Lista series por tipo | Fundamental si tu integración necesita emitir documentos con numeración concreta. |
| POST | `/numberingseries/{type}` | Crea serie | Útil para despliegues multiempresa, países o marcas. |
| PUT | `/numberingseries/{type}/{numberingSeriesId}` | Actualiza serie | Cambia formato o última numeración con control; conviene auditarlo. |
| DELETE | `/numberingseries/{type}/{numberingSeriesId}` | Elimina serie | Evitar en productivo si ya hay documentos emitidos con esa serie. |

**Tipos habituales**: factura, recibo, sales order, purchase order, proforma, waybill.

### 3.5. Products

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/products` | Lista productos | Endpoint base para sincronización completa de catálogo. |
| POST | `/products` | Crea producto | Recomendado enviar `sku` si el producto existe en otro sistema. |
| PUT | `/products/{productId}` | Actualiza producto | Cambia precio, coste, stock flags, tags, etc. |
| DELETE | `/products/{productId}` | Elimina producto | Mejor evitar si hay histórico documental; valorar archivado lógico en tu capa. |
| GET | `/products/{productId}` | Obtiene producto | Útil para sincronización incremental y comprobación de variantes. |
| GET | `/products/{productId}/image` | Obtiene imagen principal | Para portales, PIM o sincronización visual. |
| GET | `/products/{productId}/imagesList` | Lista imágenes secundarias | Primero listar, luego descargar la concreta. |
| GET | `/products/{productId}/image/{imageFileName}` | Obtiene imagen secundaria concreta | El `imageFileName` debe salir de la lista previa. |
| PUT | `/products/{productId}/stock` | Actualiza stock del producto | Permite actualizar stock por almacén y por producto/variante. |

**Recomendación de integración**:

- Usa `sku` como clave externa.
- Si gestionas stock multi-almacén, sincroniza primero `warehouses` y luego aplica `/products/{productId}/stock`.
- Si vas a crear documentos con productos existentes, usa el `sku` para que Holded los relacione automáticamente.

### 3.6. Sales Channels

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/saleschannels` | Lista canales de venta | Catálogo base para clasificar ingresos o documentos. |
| POST | `/saleschannels` | Crea canal de venta | Útil para separar marketplaces, offline, partners, etc. |
| GET | `/saleschannels/{salesChannelId}` | Obtiene canal de venta | Validación o sincronización puntual. |
| PUT | `/saleschannels/{salesChannelId}` | Actualiza canal de venta | Modifica descripción, color o numeración asociada. |
| DELETE | `/saleschannels/{salesChannelId}` | Elimina canal de venta | Evitar si ya está usado en documentos históricos. |

### 3.7. Warehouses

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/warehouses` | Lista almacenes | Paso obligado para integraciones de inventario. |
| POST | `/warehouses` | Crea almacén | Crear antes de sincronizar stock multiubicación. |
| GET | `/warehouses/{warehouseId}/stock` | Lista stock del almacén | Muy útil para auditorías o sincronización parcial por almacén. |
| GET | `/warehouses/{warehouseId}` | Obtiene almacén | Validación previa o lectura puntual. |
| PUT | `/warehouses/{warehouseId}` | Actualiza almacén | Cambio de dirección, datos de contacto o marca por defecto. |
| DELETE | `/warehouses/{warehouseId}` | Elimina almacén | Mejor evitar si tiene stock o histórico operativo. |

### 3.8. Payments

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/payments` | Lista pagos | Acepta `starttmp` y `endtmp`; útil para conciliación o exportación incremental. |
| POST | `/payments` | Crea pago | Puede vincular `bankId`, `contactId`, importe y fecha. |
| GET | `/payments/{paymentId}` | Obtiene pago | Paso previo para revisión o conciliación. |
| PUT | `/payments/{paymentId}` | Actualiza pago | Para corregir importe, fecha o descripción. |
| DELETE | `/payments/{paymentId}` | Elimina pago | Sólo si tu modelo permite revertir conciliaciones. |

### 3.9. Taxes

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/taxes` | Lista impuestos disponibles | Debes cargarlo al inicio para resolver claves como `s_iva_21` y componer líneas de documentos correctamente. |

**Consejo**: trata este endpoint como catálogo maestro para IVA, retenciones y otras combinaciones fiscales.

### 3.10. Documents

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/documents/{docType}` | Lista documentos por tipo | Usar para sincronización por clase documental. |
| POST | `/documents/{docType}` | Crea documento | Endpoint clave para facturas, presupuestos, pedidos, albaranes, compras, etc. |
| GET | `/documents/{docType}/{documentId}` | Obtiene documento | Necesario antes de pagar, enviar, adjuntar o cambiar pipeline. |
| PUT | `/documents/{docType}/{documentId}` | Actualiza documento | Mejor con payload mínimo para cambios controlados. |
| DELETE | `/documents/{docType}/{documentId}` | Elimina documento | Restringir por política de negocio. |
| POST | `/documents/{docType}/{documentId}/pay` | Registra pago de un documento | Requiere al menos `date` y `amount`; opcionalmente `treasury`. |
| POST | `/documents/{docType}/{documentId}/send` | Envía documento por email | Admite `emails`, `subject`, `message`, `mailTemplateId`. |
| GET | `/documents/{docType}/{documentId}/pdf` | Obtiene PDF del documento | Útil para portales cliente, envíos externos o archivado documental. |
| POST | `/documents/salesorder/{documentId}/shipall` | Marca envío de todas las líneas del pedido | Para automatizar expediciones simples. |
| POST | `/documents/salesorder/{documentId}/shipbylines` | Envía líneas concretas del pedido | Recomendado si trabajas con expedición parcial. |
| GET | `/documents/{docType}/{documentId}/shippeditems` | Consulta unidades enviadas/recibidas por línea | Útil para OMS/WMS y seguimiento de fulfillment. |
| POST | `/documents/{docType}/{documentId}/attach` | Adjunta fichero a un documento | Usa `multipart/form-data`; admite `file` y `setMain`. |
| POST | `/documents/{docType}/{documentId}/updatetracking` | Actualiza tracking logístico | Acepta transportista, números, fechas y notas. |
| POST | `/documents/{docType}/{documentId}/pipeline/set` | Cambia pipeline del documento | Útil para estados logísticos o flujos internos. |
| GET | `/paymentmethods` | Lista métodos de pago | Cargar este catálogo antes de crear contactos o documentos. |

#### Document types (`docType`)

Según la documentación de creación, Holded acepta tipos como:

- `invoice`
- `salesreceipt`
- `creditnote`
- `salesorder`
- `proform`
- `waybill`
- `estimate`
- `purchase`
- `purchaseorder`
- `purchaserefund`

#### Notas prácticas de creación

- Para enlazar líneas con catálogo ya existente:
  - usa `sku` para productos
  - usa `serviceId` para servicios
- Para crear un **purchase receipt**, la documentación indica:
  - `docType = purchase`
  - `isReceipt = true`
- Puedes crear documento contra un contacto existente por:
  - `contactId`
  - o `contactCode`
- Si no existe, puedes crear el contacto “en línea” usando `contactName` y demás datos de contacto.
- Puedes aplicar o no los defaults del contacto con `applyContactDefaults`.

#### Qué debería hacer un tercero antes de crear documentos

1. Resolver `contactId` o `contactCode`.
2. Resolver impuestos (`/taxes`).
3. Resolver método de pago (`/paymentmethods`) si aplica.
4. Resolver serie (`/numberingseries/{type}`) si la numeración no es la default.
5. Resolver `warehouseId` si es pedido/albarán/compra con inventario.
6. Resolver `salesChannelId` si necesitas reporting comercial.

### 3.11. Contact Groups

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/contacts/groups` | Lista grupos de contacto | Sirve para segmentación o asignación comercial. |
| POST | `/contacts/groups` | Crea grupo de contacto | Útil para replicar segmentos externos. |
| GET | `/contacts/groups/{groupId}` | Obtiene grupo | Validación puntual. |
| PUT | `/contacts/groups/{groupId}` | Actualiza grupo | Mantén sincronizada la taxonomía. |
| DELETE | `/contacts/groups/{groupId}` | Elimina grupo | Usar solo si controlas impactos en contactos existentes. |

### 3.12. Remittances

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/remittances` | Lista remesas | Útil para integraciones financieras o auditoría de cobros/pagos agrupados. |
| GET | `/remittances/{remittanceId}` | Obtiene remesa | Consulta detallada de una remesa concreta. |

### 3.13. Services

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/services` | Lista servicios | Catálogo base para bookings o documentos de servicios. |
| POST | `/services` | Crea servicio | Útil si tu oferta viene de un catálogo externo. |
| GET | `/services/{serviceId}` | Obtiene servicio | Validación antes de reservar o facturar. |
| PUT | `/services/{serviceId}` | Actualiza servicio | Cambio de metadatos o disponibilidad lógica. |
| DELETE | `/services/{serviceId}` | Elimina servicio | Mejor evitar si ya está referenciado en reservas históricas. |

---

## 4. CRM API

Base URL: `https://api.holded.com/api/crm/v1`

### 4.1. Funnels

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/funnels` | Lista funnels | Carga inicial para resolver `funnelId`. |
| POST | `/funnels` | Crea funnel | Útil si gestionas pipelines por unidad de negocio. |
| GET | `/funnels/{funnelId}` | Obtiene funnel | Consulta detallada del pipeline. |
| PUT | `/funnels/{funnelId}` | Actualiza funnel | Cambio de configuración o stages. |
| DELETE | `/funnels/{funnelId}` | Elimina funnel | Evitar si tiene leads vivos. |

### 4.2. Leads

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/leads` | Lista leads | Sincronización completa del pipeline comercial. |
| POST | `/leads` | Crea lead | Puedes indicar `funnelId`, `contactId`, `value`, `potential`, `dueDate`, `stageId`. |
| GET | `/leads/{leadId}` | Obtiene lead | Lectura puntual o refresco tras cambios. |
| PUT | `/leads/{leadId}` | Actualiza lead | Actualización parcial del lead. |
| DELETE | `/leads/{leadId}` | Elimina lead | Solo si tu política permite borrado real. |
| POST | `/leads/{leadId}/notes` | Crea nota de lead | Requiere `title`; muy útil para sincronizar actividad externa. |
| PUT | `/leads/{leadId}/notes` | Actualiza nota de lead | Requiere `noteId`. |
| POST | `/leads/{leadId}/tasks` | Crea tarea del lead | Ideal para follow-up comercial. |
| PUT | `/leads/{leadId}/tasks` | Actualiza tarea del lead | Requiere `taskId`. |
| DELETE | `/leads/{leadId}/tasks` | Elimina tarea del lead | Requiere `taskId` en el body. |
| PUT | `/leads/{leadId}/dates` | Cambia fecha de creación del lead | Útil en migraciones históricas. |
| PUT | `/leads/{leadId}/stages` | Cambia stage del lead | Acepta stage por ID o por nombre exacto. |

**Consejos**:

- Si migras desde otro CRM, crea primero funnels y stages.
- Usa `contactId` cuando el lead esté vinculado a un contacto ya existente.
- Conserva trazabilidad creando notas y tareas en lugar de sobreescribir información crítica del lead.

### 4.3. Events

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/events` | Lista eventos | Útil para agenda / actividad comercial. |
| POST | `/events` | Crea evento | Para sincronizar reuniones, llamadas o hitos. |
| GET | `/events/{eventId}` | Obtiene evento | Detalle de una interacción concreta. |
| PUT | `/events/{eventId}` | Actualiza evento | Reprogramación o edición. |
| DELETE | `/events/{eventId}` | Elimina evento | Solo si tu capa permite hard delete. |

### 4.4. Bookings

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/bookings/locations` | Lista locations | Primer paso para cualquier reserva. |
| GET | `/bookings/locations/{locationId}/slots?serviceId=...&day=YYYY-MM-DD` | Lista slots disponibles | Endpoint crítico para disponibilidad real. |
| GET | `/bookings` | Lista reservas | Sincronización de agenda/reservas. |
| POST | `/bookings` | Crea reserva | Requiere `locationId`, `serviceId`, `dateTime`, `timezone`, `language`, `customFields`. |
| GET | `/bookings/{bookingId}` | Obtiene reserva | Consulta puntual del booking. |
| PUT | `/bookings/{bookingId}` | Actualiza reserva | Reprogramación o corrección de datos. |
| DELETE | `/bookings/{bookingId}` | Cancela reserva | Trátalo como cancelación lógica desde tu negocio. |

**Flujo correcto de booking**:

1. Listar locations.
2. Resolver service disponible para esa location.
3. Consultar slots por fecha.
4. Crear booking.
5. Gestionar error `410` como “slot ya no disponible”.

---

## 5. Projects API

Base URL: `https://api.holded.com/api/projects/v1`

### 5.1. Projects

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/projects` | Lista proyectos | Sincronización global del portfolio. |
| POST | `/projects` | Crea proyecto | Crear antes de tareas o time trackings. |
| GET | `/projects/{projectId}` | Obtiene proyecto | Validación previa a cambios o imputaciones. |
| PUT | `/projects/{projectId}` | Actualiza proyecto | Cambio de datos maestros, fechas, contacto, etc. |
| DELETE | `/projects/{projectId}` | Elimina proyecto | Usar con cuidado por impacto en tareas y tiempos. |
| GET | `/projects/{projectId}/summary` | Resumen del proyecto | Muy útil para reporting: evolución, profitability y economic status. |

### 5.2. Tasks

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/tasks` | Lista tareas | Sincronización global de tareas. |
| POST | `/tasks` | Crea tarea | Crear después de proyecto si depende de él. |
| GET | `/tasks/{taskId}` | Obtiene tarea | Lectura puntual o validación. |
| DELETE | `/tasks/{taskId}` | Elimina tarea | Mejor evitar si ya tiene tiempos imputados. |

### 5.3. Time Tracking de proyectos

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/projects/{projectId}/times` | Lista tiempos de un proyecto | Para reporting operativo y facturación interna. |
| POST | `/projects/{projectId}/times` | Crea parte de tiempo en proyecto | Requiere `duration` y `costHour`; opcional `userId` y `taskId`. |
| GET | `/projects/{projectId}/times/{timeTrackingId}` | Obtiene un parte de tiempo | Consulta puntual. |
| PUT | `/projects/{projectId}/times/{timeTrackingId}` | Actualiza parte de tiempo | Correcciones de imputación. |
| DELETE | `/projects/{projectId}/times/{timeTrackingId}` | Elimina parte de tiempo | Solo si tu negocio admite rectificaciones destructivas. |
| GET | `/projects/times` | Lista tiempos de proyectos no archivados | Admite `start`, `end`, `archived`; útil para cuadros de mando. |

**Consejo**: si tu sistema fuente es otro, mapea siempre `projectId`, `taskId`, `userId` antes de registrar tiempos en Holded.

---

## 6. Team API

Base URL: `https://api.holded.com/api/team/v1`

### 6.1. Employees

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/employees` | Lista empleados | Paginado; base para obtener `employeeId`. |
| POST | `/employees` | Crea empleado | Útil al sincronizar RRHH externo → Holded. |
| GET | `/employees/{employeeId}` | Obtiene empleado | Validación o lectura puntual. |
| PUT | `/employees/{employeeId}` | Actualiza empleado | Sincronización de cambios maestros. |
| DELETE | `/employees/{employeeId}` | Elimina empleado | Mejor restringir por auditoría laboral. |

### 6.2. Employee time-tracking

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/employees/times` | Lista todos los fichajes de todos los empleados | Paginado; útil para exportación laboral. |
| GET | `/employees/times/{employeeTimeId}` | Obtiene un fichaje concreto | Consulta puntual. |
| PUT | `/employees/times/{employeeTimeId}` | Actualiza fichaje | Requiere `startTmp` y `endTmp`. |
| DELETE | `/employees/times/{employeeTimeId}` | Elimina fichaje | Solo con proceso interno de rectificación. |
| GET | `/employees/{employeeId}/times` | Lista fichajes de un empleado | Vista por empleado. |
| POST | `/employees/{employeeId}/times` | Crea fichaje manual para un empleado | Requiere `startTmp` y `endTmp`. |
| POST | `/employees/{employeeId}/times/clockin` | Inicia fichaje | Puede incluir `location`. |
| POST | `/employees/{employeeId}/times/clockout` | Finaliza fichaje | Puede incluir `latitude` y `longitude`. |
| POST | `/employees/{employeeId}/times/pause` | Pausa fichaje | Puede incluir geolocalización. |
| POST | `/employees/{employeeId}/times/unpause` | Reanuda fichaje | Puede incluir geolocalización. |

**Recomendación de integración**:

- Para apps móviles, encapsula estos endpoints detrás de tu backend; no expongas la API key de Holded al cliente final.
- Registra geolocalización si tu caso laboral lo requiere.
- Evita actualizar o borrar fichajes sin dejar rastro en tu sistema.

---

## 7. Accounting API

Base URL: `https://api.holded.com/api/accounting/v1`

### 7.1. Daily Ledger

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/dailyledger` | Lista apuntes del libro diario | Admite `page`, `starttmp`, `endtmp`; útil para extracción contable incremental. |
| POST | `/dailyledger` | Crea asiento / entry | Úsalo solo si tu integración es contable y entiende el impacto de cada apunte. |

### 7.2. Chart of Accounts

| Método | Ruta | Qué hace | Uso / indicaciones para terceros |
|---|---|---|---|
| GET | `/chartofaccounts` | Lista cuentas contables | Admite `starttmp`, `endtmp`, `includeEmpty`. Ideal para sincronizar plan contable. |
| POST | `/account` | Crea cuenta contable | Requiere `prefix`; Holded crea la siguiente cuenta disponible bajo ese prefijo. |

**Nota importante**:

- La creación contable por prefijo es especialmente útil en automatizaciones: por ejemplo, si envías `7000`, Holded genera la siguiente subcuenta disponible bajo ese padre.

---

## 8. Dependencias entre endpoints

### Para crear una factura o pedido

Necesitas normalmente:

- `contactId` o `contactCode`
- `paymentMethodId` si quieres método de pago controlado
- `numSerieId` si necesitas una serie concreta
- `salesChannelId` si clasificas comercialmente
- `warehouseId` si interviene stock/logística
- claves fiscales desde `/taxes`
- `sku` o `serviceId` si enlazas con catálogo existente

### Para gestionar stock

Necesitas:

- `warehouseId`
- `productId`
- opcionalmente IDs de variantes

### Para CRM bien modelado

Necesitas:

- `funnelId`
- `stageId`
- idealmente `contactId`

### Para bookings

Necesitas:

- `locationId`
- `serviceId`
- slot disponible (`dateTime`)

### Para proyectos y tiempos

Necesitas:

- `projectId`
- opcionalmente `taskId`
- `userId` cuando imputas tiempos de proyecto

### Para fichajes de empleados

Necesitas:

- `employeeId`

---

## 9. Estrategias de sincronización recomendadas

### Sincronización inicial

1. Catálogos
2. Maestros
3. Operativa histórica
4. Incrementales por fecha o paginación

### Sincronización incremental

- Paginar listados.
- Cuando exista filtro temporal (`starttmp`, `endtmp`, `start`, `end`), usar ventanas solapadas.
- Tras crear recursos en Holded, guardar inmediatamente el ID retornado.

### Idempotencia

Holded no expone una clave de idempotencia estándar en esta documentación, así que conviene implementarla tú:

- contactos → `customId`, email o código fiscal
- productos → `sku`
- documentos → referencia interna propia + serie + tipo
- leads → clave externa de CRM
- bookings → clave de reserva externa

### Manejo de errores

- `401/403`: revisar API key / permisos
- `404`: recurso no encontrado o ID inválido
- `410` en bookings: slot ya no disponible
- `5xx`: reintento exponencial

---

## 10. Recomendaciones arquitectónicas

### Opción A: Holded como sistema maestro

Tu plataforma:

- lee catálogos desde Holded
- crea/actualiza solo donde el negocio lo permita
- usa los IDs de Holded como referencia primaria

### Opción B: Tu plataforma como sistema maestro

Tu plataforma:

- conserva IDs propios
- guarda `holdedId` por recurso
- sincroniza por colas/eventos
- deduplica antes de crear

### Opción C: Integración híbrida

Muy recomendable:

- Holded maestro para facturación/contabilidad
- tu app maestra para CRM, portal cliente, operaciones o automatización

---

## 11. Endpoints más críticos para un primer MVP

Si alguien quiere integrar Holded rápido y con impacto real, empezaría por este bloque:

1. `GET /contacts`
2. `POST /contacts`
3. `GET /products`
4. `GET /taxes`
5. `GET /paymentmethods`
6. `POST /documents/{docType}`
7. `GET /documents/{docType}`
8. `POST /documents/{docType}/{documentId}/send`
9. `POST /documents/{docType}/{documentId}/pay`
10. `GET /saleschannels`
11. `GET /warehouses`
12. `PUT /products/{productId}/stock`
13. `GET /funnels`
14. `POST /leads`
15. `GET /bookings/locations/{locationId}/slots`

---

## 12. Resumen ejecutivo

- Holded está bastante bien separada por dominios.
- La **Invoice API** es el núcleo operativo más valioso para ERP/facturación.
- La **CRM API** permite conectar funnels, leads, eventos y reservas.
- La **Projects API** y la **Team API** abren casos de uso de productividad, imputación y control horario.
- La **Accounting API** es útil para automatización contable avanzada.
- Para una integración seria, lo más importante no es solo “llamar endpoints”, sino diseñar bien:
  - el mapeo de IDs,
  - el orden de sincronización,
  - la deduplicación,
  - el control de cambios,
  - y la trazabilidad.

---

## 13. Índice rápido por familia

### Invoice API

- Treasuries
- Contacts
- Expenses Accounts
- Numbering Series
- Products
- Sales Channels
- Warehouses
- Payments
- Taxes
- Documents
- Contact Groups
- Remittances
- Services

### CRM API

- Funnels
- Leads
- Events
- Bookings

### Projects API

- Projects
- Tasks
- Time Tracking

### Team API

- Employees
- Employees' time-tracking

### Accounting API

- Daily Ledger
- Chart of Accounts


---

## Apéndice A. URLs fuente consolidadas

A continuación se deja la relación de URLs base usadas para construir esta guía, agrupadas tal como venían en la documentación:

```text
https://developers.holded.com/reference/api-key.md
https://developers.holded.com/reference/api-key-1.md
https://developers.holded.com/reference/list-treasuries.md
https://developers.holded.com/reference/create-treasury.md
https://developers.holded.com/reference/get-treasury-1.md
https://developers.holded.com/reference/contacts.md
https://developers.holded.com/reference/list-contacts-1.md
https://developers.holded.com/reference/create-contact-1.md
https://developers.holded.com/reference/get-contact-1.md
https://developers.holded.com/reference/update-contact-1.md
https://developers.holded.com/reference/delete-contact-1.md
https://developers.holded.com/reference/get-attachments-list.md
https://developers.holded.com/reference/get-attachment.md
https://developers.holded.com/reference/list-expenses-accounts-1.md
https://developers.holded.com/reference/create-expenses-account-1.md
https://developers.holded.com/reference/get-expenses-account-1.md
https://developers.holded.com/reference/update-expenses-account-1.md
https://developers.holded.com/reference/delete-expenses-account-1.md
https://developers.holded.com/reference/get-numbering-series-1.md
https://developers.holded.com/reference/create-numbering-serie.md
https://developers.holded.com/reference/update-numbering-serie.md
https://developers.holded.com/reference/delete-numbering-serie.md
https://developers.holded.com/reference/products.md
https://developers.holded.com/reference/list-products-1.md
https://developers.holded.com/reference/create-product-1.md
https://developers.holded.com/reference/update-product-1.md
https://developers.holded.com/reference/delete-product-1.md
https://developers.holded.com/reference/get-product.md
https://developers.holded.com/reference/get-product-image.md
https://developers.holded.com/reference/list-product-images.md
https://developers.holded.com/reference/get_products-productid-image-imagefilename.md
https://developers.holded.com/reference/update-product-stock.md
https://developers.holded.com/reference/list-sales-channels-1.md
https://developers.holded.com/reference/create-sales-channel-1.md
https://developers.holded.com/reference/get-sales-channel-1.md
https://developers.holded.com/reference/update-sales-channel-1.md
https://developers.holded.com/reference/delete-sales-channel-1.md
https://developers.holded.com/reference/warehouses.md
https://developers.holded.com/reference/list-warehouses-1.md
https://developers.holded.com/reference/create-warehouse-1.md
https://developers.holded.com/reference/list-products-stock.md
https://developers.holded.com/reference/get-warehouse-1.md
https://developers.holded.com/reference/update-warehouse-1.md
https://developers.holded.com/reference/delete-warehouse.md
https://developers.holded.com/reference/list-payments-1.md
https://developers.holded.com/reference/create-payment-1.md
https://developers.holded.com/reference/get-payment-1.md
https://developers.holded.com/reference/update-payment-1.md
https://developers.holded.com/reference/delete-payment-1.md
https://developers.holded.com/reference/gettaxes.md
https://developers.holded.com/reference/documents.md
https://developers.holded.com/reference/list-documents-1.md
https://developers.holded.com/reference/create-document-1.md
https://developers.holded.com/reference/getdocument-1.md
https://developers.holded.com/reference/update-document-1.md
https://developers.holded.com/reference/delete-document-1.md
https://developers.holded.com/reference/pay-document-1.md
https://developers.holded.com/reference/send-document-1.md
https://developers.holded.com/reference/getdocumentpdf.md
https://developers.holded.com/reference/ship-all-items.md
https://developers.holded.com/reference/ship-items-by-line.md
https://developers.holded.com/reference/shipped-units-by-item.md
https://developers.holded.com/reference/attach-file.md
https://developers.holded.com/reference/update-tracking-info.md
https://developers.holded.com/reference/update-document-pipeline.md
https://developers.holded.com/reference/list-payment-methods.md
https://developers.holded.com/reference/list-contact-groups.md
https://developers.holded.com/reference/create-contact-group.md
https://developers.holded.com/reference/get-contact-group.md
https://developers.holded.com/reference/update-contact-group.md
https://developers.holded.com/reference/delete-contact-group.md
https://developers.holded.com/reference/list-remittances.md
https://developers.holded.com/reference/get-remittance.md
https://developers.holded.com/reference/list-services.md
https://developers.holded.com/reference/create-service.md
https://developers.holded.com/reference/get-service.md
https://developers.holded.com/reference/update-service.md
https://developers.holded.com/reference/delete-service.md
https://developers.holded.com/reference/funnels.md
https://developers.holded.com/reference/list-funnels-1.md
https://developers.holded.com/reference/create-funnel-1.md
https://developers.holded.com/reference/get-funnel-1.md
https://developers.holded.com/reference/update-funnel-1.md
https://developers.holded.com/reference/delete-funnel-1.md
https://developers.holded.com/reference/leads.md
https://developers.holded.com/reference/list-leads-1.md
https://developers.holded.com/reference/create-lead-1.md
https://developers.holded.com/reference/get-lead-1.md
https://developers.holded.com/reference/update-lead-1.md
https://developers.holded.com/reference/delete-lead-1.md
https://developers.holded.com/reference/create-lead-note-1.md
https://developers.holded.com/reference/update-lead-note-1.md
https://developers.holded.com/reference/create-lead-task-1.md
https://developers.holded.com/reference/update-lead-task-1.md
https://developers.holded.com/reference/delete-lead-task-1.md
https://developers.holded.com/reference/update-lead-creation-date-1.md
https://developers.holded.com/reference/update-lead-stage-1.md
https://developers.holded.com/reference/events.md
https://developers.holded.com/reference/list-events-1.md
https://developers.holded.com/reference/create-event-1.md
https://developers.holded.com/reference/get-event-1.md
https://developers.holded.com/reference/update-event-1.md
https://developers.holded.com/reference/delete-event-1.md
https://developers.holded.com/reference/list-locations.md
https://developers.holded.com/reference/get-available-slots-for-location.md
https://developers.holded.com/reference/list-bookings.md
https://developers.holded.com/reference/create-booking.md
https://developers.holded.com/reference/get-booking.md
https://developers.holded.com/reference/update-booking.md
https://developers.holded.com/reference/cancel-booking.md
https://developers.holded.com/reference/list-projects.md
https://developers.holded.com/reference/create-project.md
https://developers.holded.com/reference/get-project.md
https://developers.holded.com/reference/update-project.md
https://developers.holded.com/reference/delete-project.md
https://developers.holded.com/reference/get_projects-projectid-summary.md
https://developers.holded.com/reference/list-tasks.md
https://developers.holded.com/reference/create-task.md
https://developers.holded.com/reference/get-task.md
https://developers.holded.com/reference/delete-task.md
https://developers.holded.com/reference/get-project-times.md
https://developers.holded.com/reference/create-project-time.md
https://developers.holded.com/reference/getprojecttimes.md
https://developers.holded.com/reference/update-project-time.md
https://developers.holded.com/reference/delete-project-time.md
https://developers.holded.com/reference/list-times.md
https://developers.holded.com/reference/listemployees.md
https://developers.holded.com/reference/createemployee.md
https://developers.holded.com/reference/get-a-employee.md
https://developers.holded.com/reference/update-employee.md
https://developers.holded.com/reference/delete-a-employee.md
https://developers.holded.com/reference/listtimes.md
https://developers.holded.com/reference/gettime.md
https://developers.holded.com/reference/updatetime.md
https://developers.holded.com/reference/deletetime.md
https://developers.holded.com/reference/listemployeetimes.md
https://developers.holded.com/reference/createemployeetime.md
https://developers.holded.com/reference/employeeclockin.md
https://developers.holded.com/reference/employeeclockout.md
https://developers.holded.com/reference/employeepause.md
https://developers.holded.com/reference/employeeunpause.md
https://developers.holded.com/reference/listdailyledger.md
https://developers.holded.com/reference/createentry.md
https://developers.holded.com/reference/listaccounts.md
https://developers.holded.com/reference/createaccount.md
```
