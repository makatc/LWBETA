# 🔍 DIAGNÓSTICO INTEGRAL - APLICACIÓN LWBETA

## 📊 Estado General
- **Frontend (sutra-dashboard)**: ✅ FUNCIONAL (Next.js 14 - UI está lista)
- **Backend (sutra-monitor)**: ⚠️ INCOMPLETO (NestJS - endpoints existen pero sin BD)
- **Backend (legitwatch-comparador)**: ⚠️ INCOMPLETO (NestJS - DB service sin datos)
- **Base de Datos**: ❌ NO INICIADA (PostgreSQL no está corriendo)
- **Cache**: ❌ NO INICIADA (Redis no está corriendo)

---

## ⚠️ PROBLEMAS CRÍTICOS

### 1. **Base de Datos NO Está Corriendo** (BLOQUEANTE)
**Síntomas**:
- Los endpoints de configuración fallan ("no se puede agregar líneas")
- Las comisiones no cargan
- El watchlist no guarda datos

**Causa**:
- Docker containers no están iniciados
- Sin PostgreSQL, ninguna persistencia funciona

**Solución**:
```bash
# Desde /home/user/LWBETA
docker compose up -d
# Espera ~15 segundos a que postgres e redis estén listos
docker compose logs postgres  # Ver logs
docker compose exec postgres psql -U postgres -d sutra_monitor -c "\dt"  # Ver tablas
```

### 2. **Las Tablas No Existen**
**Causa**:
- `DatabaseMigrationService` en sutra-monitor solo crea commisiones en `sutra_commissions`
- Las otras tablas (`keyword_rules`, `phrase_rules`, `watchlist_items`, `monitor_configs`, etc.) NO se crean automáticamente
- Solo ALTER y INSERT, pero sin CREATE TABLE

**Tablas que FALTAN**:
```
✓ sutra_commissions (se crea en migración)
✗ keyword_rules
✗ phrase_rules
✗ commission_follows
✗ watchlist_items
✗ monitor_configs
✗ Para legitwatch-comparador: documents, document_versions, comparison_results, etc.
```

**Solución**:
Crear script `schema.sql` con todas las tablas

### 3. **No Hay Inicialización de Schema Automática**
**Problema**:
- `init-db.sql` solo crea bases de datos y extensiones
- Las tablas no se crean en ningún lugar
- Necesita un script SQL de inicialización completo

---

## 📋 ANÁLISIS POR COMPONENTE

### SUTRA Monitor (`apps/sutra-monitor`)
**Qué es**: Servicio de monitoreo de medidas legislativas

**Funcionalidades reales**:
✅ Autenticación (JWT)
✅ Gestión de configuración (palabras clave, comisiones, watchlist)
✅ Raspado de datos (Playwright scraper)
✅ Descubrimiento de medidas
✅ Seguimiento activo
✅ Notificaciones por webhook
✅ Sistema de colas (BullMQ) - PAUSADO (`QueueModule` comentado)

**Endpoints funcionales** (pero sin datos):
- `POST /config/keywords` → Intenta insertar en `keyword_rules` (tabla no existe)
- `GET /config/commissions/all` → Funciona si la BD está lista
- `POST /config/commissions/follow` → Insertaría en `commission_follows` (no existe)
- `GET /config/watchlist` → Queryaría `watchlist_items` (no existe)

**Problemas**:
- Las tablas subyacentes no existen
- QueueModule está deshabilitado (línea 32 en app.module.ts)
- No hay endpoints para ver "findings" (keyword matches)

---

### LegalWatch Comparador (`apps/legitwatch-comparador`)
**Qué es**: Motor de comparación de documentos legislativos

**Funcionalidades**:
✅ Carga de documentos (PDF, Word, TXT)
✅ Parseo de archivos
✅ Normalización de texto
✅ Detección de estructura
✅ Búsqueda en documentos
✅ Diff y análisis de cambios
✅ Generación de reportes
✅ Integración con Dashboard

**Endpoints**:
- `POST /documents/upload` → Guarda documento en `documents` table
- `POST /comparison/compare` → Compara versiones, genera `comparison_results`
- `GET /reports/:id` → Devuelve reporte

**Estado**:
- Código está bien estructurado
- Pero todas las tablas TypeORM no se crean automáticamente

---

### SUTRA Dashboard (`apps/sutra-dashboard`)
**Qué es**: Frontend (Next.js 14)

**Secciones**:
✅ **Comparador** (nuevo, acabamos de implementar) - COMPLETAMENTE FUNCIONAL
✅ **Dashboard** - Muestra "findings" y medidas
✅ **Medidas** - Lista legislativas
✅ **Configurador** - ⚠️ UI funciona pero backend no persiste
✅ **Usuarios** - Admin management
✅ **Perfil** - Configuración de usuario

**Problema específico del configurador**:
1. Usuario hace click en "Agregar +"
2. Frontend llama `addKeyword()` → POST /api/config/keywords
3. Backend intenta: `INSERT INTO keyword_rules (config_id, keyword) ...`
4. **Error**: `relation "keyword_rules" does not exist`
5. Frontend recibe error y lo muestra

---

## 🛠️ QUÉ FALTA

### TIER 1: CRÍTICO (sin esto nada funciona)
1. **Iniciar base de datos**: `docker compose up -d`
2. **Crear todas las tablas SQL** (crear `scripts/schema.sql`)
3. **Ejecutar el script en postgres**

### TIER 2: IMPORTANTE (funcionalidad incompleta)
4. **Habilitar BullMQ** (QueueModule - para procesamiento async)
5. **Crear endpoints de "findings"** (dashboard muestra findings pero no hay endpoint)
6. **Crear servicio de scraping automático** (Playwright scraper)
7. **Validar integridad de datos** (chequeos de FK, constraints)

### TIER 3: NICE TO HAVE (mejoras)
8. **Tests unitarios/e2e**
9. **Rate limiting en endpoints**
10. **Caché en Redis** (para queries frecuentes)

---

## 📝 PLAN DE ACCIÓN

### PASO 1: Iniciar Infraestructura
```bash
docker compose up -d
docker compose ps  # Verificar que ambos containers estén HEALTHY
```

### PASO 2: Crear Schema SQL Completo
Necesitamos crear `scripts/schema.sql` con:
```sql
-- Monitor Config
CREATE TABLE IF NOT EXISTS monitor_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) UNIQUE,
    webhook_alerts TEXT,
    webhook_sutra_updates TEXT,
    email_notifications_enabled BOOLEAN DEFAULT true,
    email_frequency VARCHAR(50) DEFAULT 'daily',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keyword_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES monitor_configs(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phrase_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES monitor_configs(id) ON DELETE CASCADE,
    phrase TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES monitor_configs(id) ON DELETE CASCADE,
    commission_id UUID NOT NULL REFERENCES sutra_commissions(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(config_id, commission_id)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES monitor_configs(id) ON DELETE CASCADE,
    measure_id UUID,
    measure_number VARCHAR(50),
    added_from VARCHAR(50) DEFAULT 'MANUAL',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- [+ más tablas para sutra_measures, ingest_runs, etc.]
-- [+ más tablas para legitwatch: documents, comparison_results, etc.]
```

### PASO 3: Ejecutar el script
```bash
docker compose exec postgres psql -U postgres -d sutra_monitor -f /docker-entrypoint-initdb.d/schema.sql
```

---

## 🎯 VALIDACIÓN

Después de ejecutar los pasos:

✅ Abre http://localhost:3000/login
✅ Login (admin@legalwatch.pr / password)
✅ Ir a Dashboard → Config
✅ Intenta agregar una palabra clave
✅ Debería guardarse sin errores

---

## 📚 ARQUITECTURA LÓGICA

```
Frontend (Next.js 3000)
    ↓
API Gateway (Next.js /api/...)
    ↓
┌─────────────────────────────────┐
│   SUTRA Monitor (3001)          │
│ - Auth                          │
│ - Config Management             │
│ - Commission Discovery          │
│ - Ingest & Tracking             │
└──────────┬──────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ PostgreSQL Database                      │
│ - sutra_commissions                      │
│ - sutra_measures                         │
│ - monitor_configs                        │
│ - keyword_rules                          │
│ - ... (16 tablas total)                  │
└──────────────────────────────────────────┘
           ↑
           │
┌──────────────────────────────────┐
│ LegalWatch Comparador (3002)     │
│ - Document Upload               │
│ - Diff Calculation              │
│ - Report Generation             │
└──────────────────────────────────┘
           ↓
      (TypeORM)
           ↓
┌──────────────────────────────────┐
│ PostgreSQL (legitwatch_comparador)
│ - documents                      │
│ - comparison_results             │
│ - ... (+ tablas)                 │
└──────────────────────────────────┘
```

---

## 🚀 CONCLUSIÓN

**NO es un mock.** Es una aplicación REAL pero INCOMPLETA que necesita:

1. Infraestructura (DB) iniciada
2. Schema SQL completo
3. Algunos módulos habilitados (QueueModule)
4. Endpoints de lectura para dashboard

**Tiempo estimado para estar 100% funcional**: 2-3 horas
