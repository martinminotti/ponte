import { createContext, useContext } from 'react';

/**
 * Dentro la schermata disegnata sotto il gesto indietro: niente effetti sull'app (barra nativa, scorciatoie, indirizzo).
 * Il valore è lo scorrimento a cui la schermata era stata lasciata (la testata ci si riposiziona sopra), null fuori.
 */
export const UnderlayContext = createContext<number | null>(null);
export const useIsUnderlay = () => useContext(UnderlayContext) !== null;
export const useUnderlayScroll = () => useContext(UnderlayContext) ?? 0;
