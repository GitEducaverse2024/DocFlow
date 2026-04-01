# Phase 99: CatPower — Reorganizacion Menu

## Goal
Existe un nuevo modulo /catpower en el menu lateral con 3 tabs (Skills, Conectores, Templates). Las rutas antiguas /skills y /connectors redirigen correctamente.

## Requirements
MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06, MENU-07

---

## Plan 01 — Rutas, layout y sidebar

### Task 1: Crear layout CatPower con tabs
**File:** `app/src/app/catpower/layout.tsx` (NEW)

Crear layout compartido para /catpower/* con:
- Tabs de navegacion: Skills | Conectores | Templates
- Cada tab es un link a la sub-ruta correspondiente
- Tab activo detectado por pathname
- Estilo consistente con el resto de la app (zinc-950, violet accents)

```tsx
// Layout con header + tabs
// Las tabs navegan a /catpower/skills, /catpower/connectors, /catpower/templates
// Highlight de tab activo basado en pathname.includes('/skills'), etc.
```

### Task 2: Mover Skills a /catpower/skills
**File:** `app/src/app/catpower/skills/page.tsx` (NEW)

- Importar y re-exportar el contenido de la pagina /skills existente
- Extraer el componente principal de `app/src/app/skills/page.tsx` a un componente reutilizable `app/src/components/skills/skills-page.tsx`
- El page.tsx de /catpower/skills simplemente renderiza `<SkillsPage />`
- Mantener /skills/page.tsx como redirect (Task 5)

### Task 3: Mover Conectores a /catpower/connectors
**File:** `app/src/app/catpower/connectors/page.tsx` (NEW)

- Mismo patron que Task 2: extraer componente reutilizable
- Extraer de `app/src/app/connectors/page.tsx` a `app/src/components/connectors/connectors-page.tsx`
- El page.tsx de /catpower/connectors renderiza `<ConnectorsPage />`
- Mantener /connectors/page.tsx como redirect (Task 5)

### Task 4: Crear placeholder Templates
**File:** `app/src/app/catpower/templates/page.tsx` (NEW)

Pagina placeholder con:
- Icono de email/template
- Titulo "Email Templates"
- Mensaje "Proximamente — Editor visual de plantillas de email corporativo"
- Breve descripcion de lo que vendra
- Estilo consistente (zinc-950, violet accents)

### Task 5: Redirects de rutas antiguas
**Files:**
- `app/src/app/skills/page.tsx` (MODIFY) — redirect a /catpower/skills
- `app/src/app/connectors/page.tsx` (MODIFY) — redirect a /catpower/connectors

```tsx
// Usar redirect() de next/navigation
import { redirect } from 'next/navigation';
export default function SkillsRedirect() {
  redirect('/catpower/skills');
}
```

**Nota:** usar redirect() del lado servidor (no client-side) para 307/308 inmediato.

### Task 6: Actualizar sidebar
**File:** `app/src/components/layout/sidebar.tsx` (MODIFY)

En el array `navItems` (lineas 46-57):
- Eliminar item Skills (href: '/skills')
- Eliminar item Connectors (href: '/connectors')
- Añadir item CatPower (href: '/catpower', icon: Boxes o Zap)
- Posicion: despues de CatFlow, antes de Notifications

El item CatPower puede ser:
- **Opcion A**: Link simple a /catpower que muestra las tabs dentro
- **Opcion B**: Menu expandible con sub-items (Skills, Conectores, Templates)

Recomendacion: **Opcion A** (link simple) — mas limpio, las tabs dentro hacen la sub-navegacion.

### Task 7: Actualizar i18n
**Files:**
- `app/messages/es.json` (MODIFY)
- `app/messages/en.json` (MODIFY)

Añadir keys:
```json
"nav": {
  "catpower": "CatPower"
}
"catpower": {
  "title": "CatPower",
  "tabs": {
    "skills": "Skills",
    "connectors": "Conectores",
    "templates": "Templates"
  },
  "templates": {
    "title": "Email Templates",
    "comingSoon": "Proximamente",
    "comingSoonDesc": "Editor visual de plantillas de email corporativo con identidad de marca, bloques arrastrables y preview en tiempo real."
  }
}
```

### Task 8: Actualizar CatBot navigate_to
**File:** `app/src/lib/services/catbot-tools.ts` (MODIFY)

En la descripcion del tool navigate_to (linea 141), añadir /catpower como ruta valida.
Tambien añadir /catpower/skills, /catpower/connectors, /catpower/templates.

### Task 9: Actualizar breadcrumbs
**Files:** `app/messages/es.json`, `app/messages/en.json` (MODIFY)

Añadir breadcrumb keys para las nuevas rutas:
```json
"breadcrumb": {
  "catpower": "CatPower",
  "catpowerSkills": "Skills",
  "catpowerConnectors": "Conectores",
  "catpowerTemplates": "Templates"
}
```

### Task 10: Build + verificacion
- `npm run build` pasa sin errores
- Verificar que /catpower muestra layout con tabs
- Verificar que /catpower/skills carga la pagina de skills
- Verificar que /catpower/connectors carga la pagina de conectores
- Verificar que /catpower/templates muestra placeholder
- Verificar que /skills redirige a /catpower/skills
- Verificar que /connectors redirige a /catpower/connectors
- Verificar que el menu lateral muestra CatPower
- Verificar que CatBot puede navegar a las nuevas rutas

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `app/src/app/catpower/layout.tsx` | NEW | Layout con tabs (Skills, Conectores, Templates) |
| `app/src/app/catpower/skills/page.tsx` | NEW | Re-exporta componente Skills |
| `app/src/app/catpower/connectors/page.tsx` | NEW | Re-exporta componente Connectors |
| `app/src/app/catpower/templates/page.tsx` | NEW | Placeholder "Proximamente" |
| `app/src/components/skills/skills-page.tsx` | NEW | Componente extraido de /skills/page.tsx |
| `app/src/components/connectors/connectors-page.tsx` | NEW | Componente extraido de /connectors/page.tsx |
| `app/src/app/skills/page.tsx` | MODIFY | Redirect a /catpower/skills |
| `app/src/app/connectors/page.tsx` | MODIFY | Redirect a /catpower/connectors |
| `app/src/components/layout/sidebar.tsx` | MODIFY | Reemplazar Skills+Connectors por CatPower |
| `app/src/lib/services/catbot-tools.ts` | MODIFY | Actualizar navigate_to con nuevas rutas |
| `app/messages/es.json` | MODIFY | Keys i18n para CatPower |
| `app/messages/en.json` | MODIFY | Keys i18n para CatPower |

---

## Verification Checklist

- [ ] /catpower muestra layout con 3 tabs
- [ ] /catpower/skills renderiza skills existentes con toda funcionalidad
- [ ] /catpower/connectors renderiza conectores existentes con toda funcionalidad
- [ ] /catpower/templates muestra placeholder
- [ ] /skills redirige a /catpower/skills
- [ ] /connectors redirige a /catpower/connectors
- [ ] Menu lateral muestra CatPower (sin Skills ni Connectors separados)
- [ ] CatBot navigate_to funciona con /catpower
- [ ] npm run build sin errores
- [ ] Mobile sidebar funciona correctamente
