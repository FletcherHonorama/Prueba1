# Estudio de contenido · paquete de reglas shopinbaz

## Estructura
- `index.html`, `app.js`: interfaz (importar parrilla, generar, corregir, verificar, aprobar, exportar a Excel).
- `engine.js`: validaciones deterministas (límites, marca, descuento/OFF, pago semanal/MSI, cifras contra el brief, legales y superíndices, emojis, variables, ortografía).
- `rules/shopinbaz.json`: **las reglas de la marca** (única fuente de verdad). La IA las recibe en cada llamada y el motor las aplica. Edita este archivo para ajustar límites, ciclos o textos legales.
- `api/ai.js`: servidor (claves de IA, respaldo entre proveedores, modo confidencial).

## Variables de entorno (Vercel → Settings → Environment Variables)
`ACCESS_CODES`, `PROVIDER_ORDER` (p. ej. `gemini,groq`), `GEMINI_API_KEY`, `GEMINI_MODEL` (opcional), `GROQ_API_KEY`, `GROQ_MODEL` (opcional), `CONFIDENTIAL_PROVIDERS` (proveedores autorizados para contenido de clientes; por defecto solo `claude`).
Con el modo confidencial activo y sin proveedor autorizado, la herramienta no envía nada a la IA.

## Publicar
Recomendado: repositorio y proyecto nuevos en Vercel (así no tocas la herramienta anterior). Sube todo el contenido de esta carpeta (incluye `api/` y `rules/`), define las variables y haz Redeploy. Pulsa «Probar conexión IA».

## Qué hace la IA y qué no
La IA redacta los campos de cada material con las reglas globales, del ciclo, del segmento y del material. **No redacta los legales**: se insertan por reglas desde la biblioteca (sección 04). Audiencias y SKU no se envían (el SKU solo si lo activas).

## Pendientes de confirmar con el equipo
Ver el mensaje de entrega: límite de título 20 vs 32, MSI legal, límites de materiales enriquecidos, variable #NOMBRE# vs #Nombre, «Es A y De sin :», SMS/RCS fuera del paquete shopinbaz.
