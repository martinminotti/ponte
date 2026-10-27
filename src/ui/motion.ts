import type { Transition } from 'motion/react';

/**
 * Molle di Ponte, con i parametri di Apple (smorzamento e risposta).
 * Smorzamento critico per tutto ciò che si tocca: nessun rimbalzo su un semplice tocco.
 * Un filo di rimbalzo solo quando il gesto ha portato slancio (trascinamento, lancio).
 */
export const SPRING: Transition = { type: 'spring', bounce: 0, duration: 0.35 };
export const SPRING_FAST: Transition = { type: 'spring', bounce: 0, duration: 0.25 };
export const SPRING_MOMENTUM: Transition = { type: 'spring', bounce: 0.2, duration: 0.4 };
