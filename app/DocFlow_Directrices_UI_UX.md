# DocFlow — Directrices de Diseño UI/UX para Claude Code

## LÉEME PRIMERO

Este documento define las reglas de diseño que DEBEN aplicarse en la página de proyecto (`src/app/projects/[id]/page.tsx`) y todos sus componentes hijos. El objetivo es que la página tenga una estructura coherente, responsive, con jerarquía visual clara y un patrón de experiencia de usuario profesional.

**IMPORTANTE**: No hagas cambios parciales. Lee TODO este documento antes de empezar. Los cambios deben aplicarse como un conjunto coherente.

---

## PROBLEMAS ACTUALES (lo que ves en la captura)

1. **Layout roto**: El contenido está aplastado a la derecha. Hay un enorme espacio vacío a la izquierda. No hay estructura de grid coherente.
2. **Pestañas perdidas**: Los tabs (Fuentes, Procesar, Historial, RAG, Chat) están abajo del viewport, casi invisibles. Deberían ser lo primero que el usuario ve después del header.
3. **Sin jerarquía visual**: Todo tiene el mismo peso. No se distingue qué es lo importante.
4. **No responsive**: En pantallas medianas el layout se rompe completamente.
5. **Zona de upload gigante vacía**: La zona de drag-and-drop ocupa demasiado espacio verticalmente cuando no se está usando.
6. **Nombres de fuentes truncados**: Los nombres largos de archivos (con path de carpeta) son ilegibles.
7. **Panel de Procesar**: Las columnas están desproporcionadas. La información del agente y el modelo están apretados a la derecha.

---

## REGLAS DE DISEÑO GLOBALES

### Principio 1: Mobile-first, desktop-optimized
- Diseñar primero para 1 columna (móvil/tablet)
- En desktop (>1024px) expandir a 2-3 columnas donde tenga sentido
- Breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`

### Principio 2: Jerarquía visual con espaciado
- El header del proyecto es lo primero (nombre + estado + acciones)
- Las pestañas son lo SEGUNDO (inmediatamente debajo, siempre visibles)
- El contenido de la pestaña activa ocupa todo el ancho disponible
- Espaciado consistente: `gap-6` entre secciones principales, `gap-4` entre elementos dentro de una sección

### Principio 3: Ancho máximo y centrado
- Contenido máximo: `max-w-7xl mx-auto` (1280px)
- Padding lateral: `px-4 md:px-6 lg:px-8`
- Nunca dejar espacios vacíos grandes sin propósito

### Principio 4: Componentes con propósito claro
- Cada card tiene UN propósito y UN call-to-action principal
- Los botones primarios son `violet-500/600`, los secundarios son `outline` con borde `zinc-700`
- Los estados destructivos son `red-500`
- Los estados de éxito son `emerald-500`

### Principio 5: Feedback visual constante
- Loading: skeleton o spinner
- Vacío: icono + texto + CTA
- Error: borde rojo + mensaje + acción
- Éxito: borde verde + mensaje

---

## ESTRUCTURA DE LA PÁGINA DE PROYECTO

### Layout general (reescribir `page.tsx`):

```
┌─────────────────────────────────────────────────┐
│  Breadcrumb                                      │
│  ┌─────────────────────────────────────────────┐ │
│  │  HEADER: Nombre + Badge Estado + Acciones   │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  TABS: [Fuentes 14] [Procesar] [Historial]  │ │
│  │        [RAG ●] [Chat]                       │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  SectionInfo (panel informativo del tab)     │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │                                              │ │
│  │  CONTENIDO DEL TAB ACTIVO                    │ │
│  │  (ocupa todo el ancho)                       │ │
│  │                                              │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Código del layout:

```tsx
return (
  <div className="px-4 md:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
    {/* Breadcrumb */}
    <nav className="flex items-center text-sm text-zinc-500 mb-4">
      <Link href="/" className="hover:text-zinc-300 transition-colors">Dashboard</Link>
      <ChevronRight className="w-3 h-3 mx-2" />
      <Link href="/projects" className="hover:text-zinc-300 transition-colors">Proyectos</Link>
      <ChevronRight className="w-3 h-3 mx-2" />
      <span className="text-zinc-200 truncate max-w-[250px]">{project?.name}</span>
    </nav>

    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-50 truncate">{project?.name}</h1>
          <Badge className={`${getStatusColor(project?.status)} text-white border-0 flex-shrink-0`}>
            {getStatusLabel(project?.status)}
          </Badge>
        </div>
        <p className="text-zinc-400 text-sm md:text-base line-clamp-2">{project?.description}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
          <Settings className="w-4 h-4 mr-1.5" /> Configurar
        </Button>
        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-400 hover:bg-red-500/10">
          <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar
        </Button>
      </div>
    </div>

    {/* Tabs - SIEMPRE VISIBLES, sticky en scroll */}
    <Tabs defaultValue="sources" className="w-full">
      <div className="sticky top-0 z-10 bg-zinc-950 pb-2 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <TabsList className="w-full bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-1 flex flex-wrap gap-1">
          {/* cada trigger con el estilo definido */}
        </TabsList>
      </div>

      {/* Contenido con margen superior */}
      <div className="mt-6">
        <TabsContent value="sources">...</TabsContent>
        {/* etc */}
      </div>
    </Tabs>
  </div>
);
```

**CLAVE**: Las tabs deben ser `sticky top-0` para que siempre estén visibles al hacer scroll.

---

## PESTAÑA FUENTES — Rediseño

### Zona de upload (más compacta)

La zona de drag-and-drop NO debe ocupar la mitad de la pantalla. Diseño:

```
┌──────────────────────────────────────────────────┐
│ 📂 Fuentes del proyecto                          │
│ Sube y organiza la documentación...              │
│ 💡 tip  💡 tip  💡 tip                            │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ [Archivos] [URLs] [YouTube] [Notas]              │
│ ┌──────────────────────────────────────────────┐ │
│ │  ☁️  Arrastra archivos o haz clic            │ │
│ │  Soporta PDF, DOCX, TXT, MD...  (Máx 50MB)  │ │
│ └──────────────────────────────────────────────┘ │
│ [Subir carpeta]                                   │
└──────────────────────────────────────────────────┘

14 fuentes (14 archivos, 0 URLs, 0 YouTube, 0 notas)
☐ Seleccionar todo                          🔍 Buscar

┌──────────────────────────────────────────────────┐
│ ⠿ ☑ 📄 All_Uploads.txt              FILE  783KB │
│ ⠿ ☑ 📄 3D Portfolio.txt             FILE  132KB │
│ ⠿ ☑ 📄 Building 3D Apps...          FILE   58KB │
│ ...                                               │
└──────────────────────────────────────────────────┘
```

**Cambios clave en la zona de upload**:
- Altura máxima de la zona drag-and-drop: `h-32` (128px), NO más
- Los 4 tabs de tipo de fuente están DENTRO de la card de upload, no flotando arriba
- El botón "Subir carpeta" está debajo de la zona de drop, alineado a la izquierda

**Cambios en la lista de fuentes**:
- Los nombres de archivo largos se muestran SOLO con el nombre del archivo, NO la ruta completa de la carpeta
- Extraer solo el nombre: `source.name.split('/').pop()` para mostrar
- El path completo se muestra en tooltip al hacer hover
- Cada fila tiene altura fija (`h-12`) para consistencia
- El badge FILE/URL/YOUTUBE/NOTE está alineado a la derecha con el tamaño

```tsx
// Mostrar nombre corto, tooltip con path completo
const displayName = source.name.includes('/') ? source.name.split('/').pop() : source.name;

<span className="text-sm text-zinc-300 truncate flex-1" title={source.name}>
  {displayName}
</span>
```

---

## PESTAÑA PROCESAR — Rediseño completo

El layout actual tiene 3 columnas mal proporcionadas. Rediseñar como flujo vertical con secciones claras:

```
┌──────────────────────────────────────────────────┐
│ 🤖 Procesamiento con IA                          │
│ Selecciona fuentes, elige modelo, procesa...     │
└──────────────────────────────────────────────────┘

┌─────────────────────┐  ┌────────────────────────┐
│ AGENTE IA           │  │ CONFIGURACIÓN          │
│ ┌─────────────────┐ │  │                        │
│ │ 🔍 Analista     │ │  │ Modelo: [gemini-main▾] │
│ │ gemini-main     │ │  │                        │
│ │ [Cambiar]       │ │  │ ☑ Procesamiento local  │
│ └─────────────────┘ │  │   Bypass de n8n        │
│                     │  │                        │
│ O si no hay agente: │  │                        │
│ [Asignar agente]    │  │                        │
└─────────────────────┘  └────────────────────────┘

┌──────────────────────────────────────────────────┐
│ FUENTES A INCLUIR (14/14 seleccionadas)          │
│ [✓ Seleccionar todas] [Deseleccionar]            │
│ ☑ All_Uploads.txt                    FILE  783KB │
│ ☑ 3D Portfolio.txt                   FILE  132KB │
│ ...                                               │
│ (max-height: 300px, scroll)                       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ INSTRUCCIONES ADICIONALES (Opcional)              │
│ ┌──────────────────────────────────────────────┐ │
│ │ Añade contexto...                            │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────┐
  │  ▶  PROCESAR CON ANALISTA DE PROYECTO        │
  │     gemini-main · 14 fuentes seleccionadas   │
  └──────────────────────────────────────────────┘
```

**Layout en código**:
```tsx
<div className="space-y-6">
  <SectionInfo ... />

  {/* Agente + Config: 2 columnas en desktop, 1 en móvil */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <Card>... agente ...</Card>
    <Card>... modelo + checkbox local ...</Card>
  </div>

  {/* Fuentes: ancho completo */}
  <Card>... fuentes checklist ...</Card>

  {/* Instrucciones: ancho completo */}
  <Card>... textarea ...</Card>

  {/* Botón: ancho completo, prominente */}
  <Button className="w-full h-14 text-lg bg-violet-600 hover:bg-violet-500 ...">
    <Play className="w-5 h-5 mr-2" />
    Procesar con {agentName}
    <span className="text-violet-300 ml-2 text-sm">
      {selectedModel} · {selectedSources.size} fuentes
    </span>
  </Button>
</div>
```

**El botón de Procesar debe**:
- Ser el elemento más prominente de la página
- Mostrar el nombre del agente, modelo y nº de fuentes
- Estar deshabilitado con mensaje claro si falta agente o fuentes
- Ocupar ancho completo (`w-full`)

---

## PESTAÑA RAG — Sin cambios mayores

El RAG panel ya tiene buen diseño. Solo ajustar:
- Asegurar que las cards de stats usan `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- El formulario de configuración centrado con `max-w-2xl mx-auto`

---

## PESTAÑA CHAT — Sin cambios mayores

El chat panel ya tiene buen diseño. Solo ajustar:
- Asegurar altura fija: `h-[calc(100vh-300px)] min-h-[400px]`
- El input debe tener `sticky bottom-0`

---

## PESTAÑA HISTORIAL — Mejoras menores

- Cards expandibles en vez de lista plana
- Cada card muestra: versión (badge grande), agente, fecha, duración
- Click para expandir y ver preview del markdown
- Si está vacío: icono + "No hay versiones procesadas. Ve a la pestaña Procesar."

---

## COMPONENTES COMPARTIDOS

### SectionInfo (ya existe, mantener como está)
El panel informativo con emoji, título, descripción y tips está bien. No cambiar.

### Tabs
- `sticky top-0 z-10` para que siempre estén visibles
- `backdrop-blur bg-zinc-950/90` para efecto de transparencia al hacer scroll
- `flex-wrap` para que en móvil los tabs se apilen si no caben
- Cada tab: icono + texto + badge (si aplica)
- Tab activo: `bg-violet-600 text-white`
- Tab inactivo: `text-zinc-400 hover:text-zinc-200`

### Cards
- Fondo: `bg-zinc-900`
- Borde: `border-zinc-800`
- Padding header: `p-4 md:p-6`
- Padding content: `px-4 pb-4 md:px-6 md:pb-6`
- Títulos: `text-base md:text-lg font-semibold text-zinc-50`

### Botones
- Primario: `bg-violet-600 hover:bg-violet-500 text-white`
- Secundario: `bg-transparent border border-zinc-700 text-zinc-300 hover:bg-zinc-800`
- Destructivo: `bg-red-500/10 text-red-500 hover:bg-red-500/20`
- Deshabilitado: `opacity-50 cursor-not-allowed`
- Tamaños: `size="sm"` para acciones secundarias, `size="default"` para principales, `h-14 text-lg` para CTA principales

### Badges
- Estado draft: `bg-zinc-700 text-zinc-300`
- Estado sources_added: `bg-blue-600 text-white`
- Estado processing: `bg-amber-600 text-white` + animación pulse
- Estado processed: `bg-emerald-600 text-white`
- Estado rag_indexed: `bg-violet-600 text-white`
- Tipo FILE: `bg-blue-500/10 text-blue-400 border-0`
- Tipo URL: `bg-green-500/10 text-green-400 border-0`
- Tipo YOUTUBE: `bg-red-500/10 text-red-400 border-0`
- Tipo NOTE: `bg-purple-500/10 text-purple-400 border-0`

---

## ORDEN DE APLICACIÓN

1. **page.tsx** — Reestructurar el layout (header, tabs sticky, contenido full-width)
2. **source-manager.tsx / source-list.tsx** — Compactar zona upload, nombres cortos en la lista
3. **process-panel.tsx** — Rediseñar layout 2 columnas arriba + fuentes + botón abajo
4. **Verificar responsive** — Probar visualmente en viewport de 768px y 1280px

Después de cada cambio, ejecuta `npm run build` en `~/docflow/app/`.

---

