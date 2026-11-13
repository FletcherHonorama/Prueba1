# Estudio de contenido · paquete de reglas shopinbaz

## Estructura
- `index.html`, `app.js`: interfaz (importar parrilla, generar, corregir, verificar, aprobar, exportar a Excel).
- `xlsxpatch.js`: escribe los copies dentro del .xlsx original (estilos, imágenes y fórmulas intactos).
- `api/sheet.js`: lee Google Sheets compartidos como «Cualquier persona con el enlace».
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

## Ciclos
El menú incluye los ciclos y áreas del tablero (Retención, Activación, Crédito, Negocio, Uso, Recuperación, Nativo, Mercadeo, AdOps, Data, Content & brand, Experimentos, USO | Préstamo, WEB Elektra, WEB shopinbaz, App Elektra, Promociones, E-commerce, GTP) y las variantes con reglas detalladas (Recu-Retención PN y PE, Desvelados). Activación, Uso y USO | Préstamo tienen reglas propias; Retención y Recuperación usan Recu-Retención PN (Push sencilla y Centro de notificaciones) o PE (el resto); los demás aplican solo las reglas generales. WEB Elektra y App Elektra **no** aplican reglas de shopinbaz. El ciclo se detecta solo desde la celda «Ciclo o área transversal» de la hoja. Para agregar reglas a un ciclo, edita su entrada en `rules/shopinbaz.json` (`reglas`, `limites`, `valida`).

## Exportar en el formato del archivo original
«Exportar en el formato del archivo original» escribe los copies en las mismas filas del archivo que subiste: Título ← título (o título del copy out), Copy out ← cuerpo (o subtítulo), Copy in ← copy in (con «CTA: …» si la plantilla no tiene columna CTA), Legal ← legal automático, y los conteos «# carac.» con fórmula LEN. Conserva estilos, imágenes, hojas ocultas y fórmulas. Si hay varias variantes por fila se usa la aprobada (o la primera). Entrada CSV → salida CSV; Google Sheets → Excel con las mismas columnas. Tras recargar la página hay que volver a elegir el archivo original.

## Referencias visuales (imágenes)
En «01 Configuración → Referencias visuales» subes hasta 6 imágenes de piezas anteriores. Se reducen en el navegador y solo se envían al pulsar «Analizar». La IA describe tono, recursos del texto y estilo visual, y propone una guía y textos de ejemplo que se agregan a la guía adicional. Requiere un proveedor con visión (Gemini o Claude) en `PROVIDER_ORDER`; Groq no se usa para imágenes. En modo confidencial, el proveedor debe estar en `CONFIDENTIAL_PROVIDERS`. Evita imágenes con datos personales.

## Verificación de SKU
Cada SKU de la parrilla genera un enlace «buscar en Google» (SKU + «Elektra», configurable) que abre tu navegador; ahí confirmas la disponibilidad en la ficha del producto y marcas Disponible / Agotado / No encontrado (opcionalmente pegas el enlace del producto). Por defecto una pieza no puede aprobarse mientras tenga SKU sin confirmar como «Disponible» (se puede desactivar). «Exportar lista de SKU a verificar» genera el checklist en Excel. La búsqueda no pasa por el servidor ni se envía a ningún proveedor de IA. La disponibilidad cambia: vuelve a verificar antes del envío.

## Pendientes de confirmar con el equipo
Ver el mensaje de entrega: límite de título 20 vs 32, MSI legal, límites de materiales enriquecidos, variable #NOMBRE# vs #Nombre, «Es A y De sin :», SMS/RCS fuera del paquete shopinbaz.
