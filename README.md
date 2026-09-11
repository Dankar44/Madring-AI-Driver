# Madring AI Driver

Simulación en el navegador donde 100 coches aprenden a conducir el circuito **MADRING**
(el nuevo trazado de F1 de Madrid) por evolución: cada coche lleva un cerebro de 13 pesos
que lee 7 sensores de distancia y decide dirección, acelerador y freno; al final de cada
generación los mejores se clonan con mutaciones y los demás desaparecen. Nadie les enseña
a conducir: aprenden porque los malos se estrellan.

Demo: https://dankar44.github.io/Madring-AI-Driver/

## Qué hay en pantalla

- **Mapa** (mitad izquierda): cámara siguiendo al líder con el coche apuntando a la derecha,
  o el circuito completo con los 100 coches. Circuito a **escala real** (5.414 m × 12 m,
  1 unidad = 0,24 m; velocidad punta 272 km/h) en un barrio de Madrid generado: manzanas,
  avenidas, glorietas, parques, pabellones y gradas llenas de público en el exterior de cada curva.
- **Red neuronal en directo**: los sensores con su valor, las conexiones con la señal que
  circula ahora (puntos en movimiento) y las tres decisiones con su barra.
- **Fitness por generación**: mejor coche y media de la población.
- **Memorias**: instantáneas del mejor cerebro en las generaciones 1, 5, 10, 25, 50, 100 y cada
  50 después (o a mano). Se pueden reproducir en solitario o enfrentar en una **carrera**
  eligiendo dos o más.
- Un «?» en cada apartado explica qué se está viendo.

## Controles

Pausa/Reanudar · Reiniciar (deja la generación nueva en pausa) · Guardar memoria ·
Velocidad 0.25x–50x · Vista · Sensores 7 o 3 · Opacidad de los demás coches.

Parámetros por URL: `?seed=7` (tirada repetible), `?cars=100`, `?speed=5`, `?sensors=3`,
`?ghost=35`, `?view=swarm`, `?rec=1` (solo el mapa, para grabar).

## Ejecutar en local

Es HTML estático: `python3 -m http.server 8080` en la carpeta y abrir `http://localhost:8080`.
Única dependencia externa: `three.js` por CDN, para la spline que genera el trazado.

## Créditos

Simulador, algoritmo evolutivo y trazado originales de [Daniel Karimi](https://github.com/dankar44).
Rediseño del panel (español, escala real, ciudad, red en directo, carreras) de
[Guillermo Prieto](https://github.com/guillermop2002).
