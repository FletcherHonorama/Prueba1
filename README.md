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

## Parrilla anterior autorizada (referencia de estilo y estructura)
En «02 Parrilla anterior autorizada» subes una parrilla ya aprobada (Excel o CSV). La herramienta (1) calcula longitudes y recursos por material y campo, (2) muestra qué alertas habría generado esa parrilla con tus reglas actuales (útil para ajustar límites o excepciones), (3) pide a la IA un perfil de estilo y estructura y una guía editable, y (4) guarda un **detector de similitud** con huellas numéricas de los textos (no los textos). El análisis se muestra en secciones plegables (estadísticas, alertas y perfil de la IA) que puedes ocultar o mostrar. Al guardarla como referencia activa, la IA recibe solo la guía (y, si activas la casilla, hasta 4 ejemplos que tú elijas) con la instrucción de no copiar frases, y toda pieza nueva que repita o se parezca mucho a un copy anterior queda marcada (repetición textual de 5+ palabras = error; parecido ≥70% = aviso). Las muestras que se envían a la IA van con datos personales enmascarados y respetan el modo confidencial. Usa solo parrillas que tengas autorizado usar con este fin.

## Temporalidad (tag para Diseño)
En «01 Configuración» escribes la temporalidad (si aplica); la IA nunca la inventa. En los materiales con Copy in (Push enriquecida, WhatsApp, Mailing) el sistema la inserta al inicio del Copy in como «(Tag …)» (formato editable en `rules/shopinbaz.json`, clave `tag`); en los demás se usa como dato para la redacción. Puedes cambiarla por pieza, aplicarla a todas, o traerla de una columna «Temporalidad» / «Vigencia» de la parrilla. Se revisa su ortografía y sale en el Excel (en la celda Copy in del archivo original y en una columna «Temporalidad (tag)» del resumen).

## Borrar todas las propuestas
El botón «Borrar todas las propuestas» (con confirmación y «Deshacer borrado») elimina las piezas, la parrilla cargada y la temporalidad para empezar de cero; conserva ciclo, reglas, biblioteca legal, límites y referencia activa.

## Ciclos
El menú incluye los ciclos y áreas del tablero (Retención, Activación, Crédito, Negocio, Uso, Recuperación, Nativo, Mercadeo, AdOps, Data, Content & brand, Experimentos, USO | Préstamo, WEB Elektra, WEB shopinbaz, App Elektra, Promociones, E-commerce, GTP) y las variantes con reglas detalladas (Recu-Retención PN y PE, Desvelados). Activación, Uso y USO | Préstamo tienen reglas propias; Retención y Recuperación usan Recu-Retención PN (Push sencilla y Centro de notificaciones) o PE (el resto); los demás aplican solo las reglas generales. WEB Elektra y App Elektra **no** aplican reglas de shopinbaz. El ciclo se detecta solo desde la celda «Ciclo o área transversal» de la hoja. Para agregar reglas a un ciclo, edita su entrada en `rules/shopinbaz.json` (`reglas`, `limites`, `valida`).

## Exportar en el formato del archivo original
«Exportar en el formato del archivo original» escribe los copies en las mismas filas del archivo que subiste: Título ← título (o título del copy out), Copy out ← cuerpo (o subtítulo), Copy in ← copy in (con «CTA: …» si la plantilla no tiene columna CTA), Legal ← legal automático, y los conteos «# carac.» con fórmula LEN. Conserva estilos, imágenes, hojas ocultas y fórmulas. Si hay varias variantes por fila se usa la aprobada (o la primera). Entrada CSV → salida CSV; Google Sheets → Excel con las mismas columnas. Tras recargar la página hay que volver a elegir el archivo original.

## Verificación de SKU
Cada SKU de la parrilla genera un enlace «buscar en Google» (SKU + «Elektra», configurable) que abre tu navegador; ahí confirmas la disponibilidad en la ficha del producto y marcas Disponible / Agotado / No encontrado (opcionalmente pegas el enlace del producto). Por defecto una pieza no puede aprobarse mientras tenga SKU sin confirmar como «Disponible» (se puede desactivar). «Exportar lista de SKU a verificar» genera el checklist en Excel. La búsqueda no pasa por el servidor ni se envía a ningún proveedor de IA. La disponibilidad cambia: vuelve a verificar antes del envío.

## Pendientes de confirmar con el equipo
Ver el mensaje de entrega: límite de título 20 vs 32, MSI legal, límites de materiales enriquecidos, variable #NOMBRE# vs #Nombre, «Es A y De sin :», SMS/RCS fuera del paquete shopinbaz.
