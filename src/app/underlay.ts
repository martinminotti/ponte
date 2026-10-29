import { createContext, useContext } from 'react';

/** Dentro la schermata disegnata sotto il gesto indietro: niente effetti sull'app (barra nativa, scorciatoie, indirizzo). */
export const UnderlayContext = createContext(false);
export const useIsUnderlay = () => useContext(UnderlayContext);
