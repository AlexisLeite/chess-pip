# Chess PiP

Extensión para jugar en Chess.com desde un tablero interactivo en una ventana
flotante que permanece por encima de otras aplicaciones.

## Instalación

Necesitas Chrome de escritorio, versión 119 o posterior.

1. Descarga este repositorio desde **Code → Download ZIP** y descomprímelo, o clónalo:

   ```sh
   git clone https://github.com/AlexisLeite/chess-pip.git
   ```

2. Abre `chrome://extensions` en Chrome.
3. Activa **Modo de desarrollador**, arriba a la derecha.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta que contiene `manifest.json`.
5. Recarga las pestañas de Chess.com que ya estuvieran abiertas.

Para usarla no necesitas instalar dependencias, compilar ni iniciar un servidor.

## Cómo se usa

1. Inicia sesión en [Chess.com](https://www.chess.com) y abre una partida.
2. Pulsa **♟ Abrir tablero flotante**, abajo a la derecha de la página.
3. Mueve o redimensiona la ventana como prefieras.
4. Juega directamente en el tablero flotante, seleccionando una pieza y su destino
   o arrastrándola hasta la casilla correspondiente.

Mantén abierta la pestaña original: conserva la partida y la conexión. Puedes cambiar
de pestaña o trabajar en otra aplicación mientras el tablero queda visible. El chat,
los ajustes y los demás controles de Chess.com siguen en la pestaña original.

Para devolver el tablero a su lugar, cierra la ventana flotante o pulsa
**♟ Devolver tablero a la página** en la pestaña original.

### Confirmar o cancelar

En partidas que requieren confirmación, aparecen dos botones pequeños abajo a la
derecha del tablero, justo encima de la franja negra:

| Icono | Acción |
| --- | --- |
| **✕** | Cancela la jugada pendiente para elegir otra. |
| **✓** | Confirma y envía la jugada mediante el botón original de Chess.com. |

Los botones aparecen cuando la página ofrece esas acciones y desaparecen al dejar
de haber una jugada pendiente. Cada uno ocupa media casilla de alto y de ancho.
La extensión nunca confirma una jugada automáticamente.

### Tiempos y oponente

La franja negra debajo del tablero muestra una sola línea con letra pequeña:

```text
24 hrs - 1 day · joaquin2000zzzz (936)
```

El primer tiempo es el tuyo; el segundo es el del oponente. A continuación aparecen
su nombre y Elo. Los datos se leen de la página y se actualizan durante la partida.

### Siguiente partida diaria

Si Chess.com avanza a otro juego mediante su navegación interna, la extensión mantiene
la misma ventana flotante y muestra el tablero, los tiempos y el oponente nuevos.
Mientras carga el nuevo tablero, el anterior se oculta y queda desactivado.

Una recarga completa de la página cierra PiP por una restricción de Chrome. En ese
caso, pulsa nuevamente **♟ Abrir tablero flotante**.

## Actualizar

1. Descarga la nueva versión o ejecuta `git pull` dentro de la carpeta del repositorio.
2. Abre `chrome://extensions` y pulsa el botón de recarga de **Chess.com · Tablero flotante**.
3. Recarga la página de Chess.com y vuelve a abrir el tablero flotante.

## Si algo no funciona

- **No aparece el botón:** recarga Chess.com, comprueba que la extensión esté activada
  y abre una partida con un tablero visible.
- **El tablero no responde:** cierra PiP para devolverlo a la página. Si sigue fallando,
  recarga la página y vuelve a abrir PiP.
- **PiP se cierra al navegar:** una recarga completa cierra la ventana; ábrela de nuevo.
- **Faltan tiempos o datos del oponente:** solo se muestran los datos disponibles en
  la página para el usuario conectado y el modo de juego actual.

Es una extensión experimental. Los cambios de interfaz de Chess.com pueden requerir
ajustes. Conviene probar primero contra un bot antes de usarla en otras partidas.

## Privacidad

La extensión se ejecuta únicamente en Chess.com. No incluye motores de ajedrez,
no recomienda jugadas y no envía datos a servidores propios. Todo su código está
incluido en este repositorio.

## Desarrollo

`main.js` se carga mediante un content script en el contexto MAIN y usa Document
Picture-in-Picture para trasladar el componente real del tablero y devolverlo al cerrar.

Para ejecutar las pruebas automatizadas con Node.js y npm:

```sh
npm ci --ignore-scripts
npm test
```

Las pruebas simulan el DOM y la API PiP para comprobar apertura, restauración,
confirmación, cancelación, tiempos y cambios de tablero. No sustituyen la prueba
manual de interacción en Chrome.
