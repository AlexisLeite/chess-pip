# Chess.com · Tablero flotante

Extensión local para Chrome de escritorio (119 o posterior), sin compilación.

## Instalación

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona `C:\code\chess-pip-extension`.
4. Recarga la pestaña de chess.com para que se cargue la extensión.
5. Abre una partida contra un bot y pulsa **♟ Abrir tablero flotante**, abajo a la derecha.

La ventana se puede arrastrar sobre otras aplicaciones y redimensionar. La pestaña
original debe permanecer abierta. Cierra PiP o pulsa **Devolver tablero a la página**
en la pestaña original para restaurarlo. La ventana flotante contiene únicamente el
tablero, sin filas de jugadores, barra de botones ni márgenes añadidos.
Debajo del tablero aparece una franja negra con los tiempos en blanco, en una sola
línea: `mi tiempo - tiempo del otro`, sin etiquetas. Los valores se toman de los
relojes de Chess.com y se identifican mediante el perfil del usuario conectado.
El tablero se ajusta al espacio disponible para que la franja no tape las piezas.
Los tiempos, el nombre y el Elo del oponente aparecen en una única línea de 10 px:
`mi tiempo - tiempo del otro · Oponente (Elo)`. La franja mide 18 px de alto.
Los datos se actualizan al cambiar de partida.
Cuando Chess.com solicita confirmar una jugada, aparecen los iconos **✕** (cancelar)
y **✓** (confirmar), abajo a la derecha sobre el tablero, justo encima de la barra
negra. Cada botón mide media casilla de alto y de ancho y tiene una etiqueta accesible.
Cada uno activa su botón original; desaparecen cuando ya no hay confirmación pendiente.
Respetan los estados deshabilitado y de carga.

## Qué hace

- Traslada únicamente el componente real del tablero; jugadores y relojes quedan en la pestaña.
- Conserva los estilos de la página y adapta el tablero al tamaño de la ventana.
- Reenvía movimientos y liberaciones del ratón/puntero a los manejadores del documento original.
- Mantiene PiP abierto durante la navegación interna y traslada el nuevo tablero si la página lo reemplaza.
- Restaura el tablero de la partida actual cuando cierras PiP o pulsas Devolver.
- Muestra un error y restaura el tablero si falla la preparación de la ventana.
- Solo se ejecuta en chess.com. No solicita permisos de otras páginas, no lee credenciales,
  no envía datos a servidores y no incluye motores ni sugerencias de jugadas.

## Alcance de esta primera versión

Es un prototipo para probar: la interacción real del tablero dentro de PiP todavía
requiere validación manual tras cargar la extensión. No se puede asegurar que todos
los modos de Chess.com funcionen igual ni que futuras actualizaciones mantengan su DOM.
El panel lateral permanece en la pestaña. Al avanzar a otra partida diaria mediante
la navegación interna, PiP muestra el tablero nuevo y actualiza los tiempos y controles.
Mientras se crea el nuevo tablero, oculta y desactiva el anterior. Si la página reutiliza
el componente, permanece en PiP. Una recarga completa del documento cierra PiP por una
restricción de Chrome; en ese caso es necesario abrirlo de nuevo con el botón.

Se investigó una partida completa contra Marko (300), terminada en 29.Ah6#.
Se verificaron movimientos con dos clics, capturas, jaques, enroque, actualización de
jugadas, cambio de URL y pantalla de resultado. Esa partida se jugó en la página
normal: la herramienta de Chrome bloqueó la inyección de la prueba de PiP.

## Prueba manual recomendada

1. En una partida contra un bot, abre PiP y mueve con clic de origen y destino.
2. Comprueba que el bot responde y que ambas jugadas se reflejan en la pestaña.
3. Prueba arrastrar una pieza, redimensionar y jugar con otra aplicación delante.
4. Cierra y vuelve a abrir PiP varias veces; verifica que el tablero vuelve a su sitio.
5. Prueba una partida con reloj, enroque, promoción y el final de partida.
6. Si algo falla, devuelve el tablero. Si fuese necesario, recarga la página.

## Desarrollo

`main.js` se ejecuta en el contexto MAIN porque comparte elementos y eventos con la
página. Todo el código está incluido en este directorio; no necesita servidor.
El botón dentro de la página conserva la activación de usuario exigida por Document PiP.

Pruebas de ciclo de vida con Node: `npm ci --ignore-scripts` y `npm test`.
Las pruebas simulan el DOM y la API PiP; no sustituyen la prueba manual en Chrome.
