# Madring AI Driver

Interactive 2D autonomous-driving experiment inspired by MADRING, Madrid's new Formula 1 circuit.

The goal is to train virtual cars from scratch using population-based neural evolution while making the learning process visible: sensors, crashes, generations, progress, laps and historical neural memories.

## Current MVP

- top-down MADRING track geometry traced from the supplied reference
- simple vehicle physics
- 7 ray-cast sensors
- collision / off-track detection
- progress scoring and lap detection
- population-based neural controllers
- generations, elite selection and mutation
- 1x / 5x / 20x / 50x training speeds
- automatic neural-memory snapshots at generations 1, 5, 10, 25, 50, 100 and every 50 generations afterwards
- manual memory snapshots
- persistent browser storage for saved memories
- replay of an old neural brain without destroying the live training state

## Neural memories

A memory checkpoint stores the best controller genome from a point in training together with its generation, fitness, progress and completed laps. This makes it possible to compare an early "dumb" driver with a medium-trained driver and a later, more capable driver.

Saved memories persist in the browser via localStorage. Resetting the live training does not delete them; they are only removed with the dedicated **Clear memories** control.

## Next

- smooth/refine the MADRING geometry
- explicit sector/checkpoint gates around the lap
- more robust anti-cheat progress scoring
- richer vehicle physics and braking behavior
- training graphs and side-by-side brain comparison
- racing-line history and best-lap replay
