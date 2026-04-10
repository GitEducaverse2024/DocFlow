# Canvas Design Rules Index

Indice escalable de reglas de diseno para el Pipeline Architect. Si necesitas detalle de una regla especifica, llama get_canvas_rule(rule_id).

## Data Contracts
- R01: Define contrato JSON (input/output) entre TODOS pares de nodos ANTES de instructions
- R10: JSON in -> JSON out. Mantener TODOS los campos originales; anadir solo los nuevos
- R13: Nombres canonicos identicos a lo largo del pipeline (reply_to_email en TODOS)
- R15: Cada nodo LLM recibe cantidad MINIMA de info. Recorta body, limita campos
- R16: Max Tokens = estimacion realista del output (N items x M campos x 60 tokens)

## Node Responsibilities
- R05: Un nodo = una responsabilidad. Redactar+maquetar+seleccionar = dividir
- R06: Conocimiento de negocio en SKILLS, no en instructions del nodo
- R07: CatBrain=text-to-text. Agent con CatBrain=JSON-to-JSON con RAG. Arrays = SIEMPRE Agent
- R08: No vincular conectores ni skills innecesarios. Cada tool confunde al LLM
- R09: CatPaws genericos, especializacion en el canvas (extras del nodo)
- R20: Si puede hacerse con codigo, NO delegar al LLM. LLM genera esquema, codigo ejecuta
- R21: El codigo SIEMPRE limpia output del LLM (strip markdown, validar JSON, merge)
- R23: Separar nodos de pensamiento (LLM) de nodos de ejecucion (codigo)

## Arrays & Loops
- R02: N_items x tool_calls vs MAX_TOOL_ROUNDS(12). Si >60% -> ITERATOR o Dispatcher
- R14: Arrays + tool-calling = ITERATOR siempre. Jamas arrays >1 item a nodos tool-calling
- R25: Idempotencia obligatoria. Registrar messageId procesados (triple proteccion)

## Instructions Writing
- R11: Decir QUE hacer, no prohibir. Si escribes "NO X" 5 veces, cambia el tipo de nodo
- R12: Especificar SIEMPRE "PASA SIN MODIFICAR" para items que el nodo debe ignorar
- R17: Todo LLM es probabilistico. Asumir basura. Planificar contratos, ITERATOR, fallbacks

## Planning & Testing
- R03: Traducir problema de negocio a criterios tecnicos verificables
- R04: Probar flujo minimo (START -> primer LLM -> Output) con datos reales antes

## Templates
- R18: Toda plantilla con contenido dinamico NECESITA >=1 bloque instruction
- R19: Separar seleccion de plantilla (skill) de maquetacion (tools)

## Resilience & References
- R22: Referencias entre entidades usan RefCodes (6 chars), lookup tolerante
- R24: Nunca fallback destructivo. Input corrupto -> vacio, no inventar

## Side Effects Guards
- SE01: Antes de cada send/write/upload/create -> insertar condition guard automatico
- SE02: Guard valida que el contrato de entrada tiene TODOS los campos requeridos no vacios
- SE03: Si guard.false -> agent reportador auto-repara via CatBot 1 vez, luego log_knowledge_gap

## Anti-patterns
- DA01: No pases arrays >1 item a nodos con tool-calling interno (usa ITERATOR)
- DA02: No enlaces connectors/skills que el nodo no va a usar
- DA03: No generes URLs con LLM, usa campos especificos del output del tool
- DA04: No dependas de datos fuera del input explicito del nodo
