import { useEffect, useState } from "react";

const UNE_MINUTE_MS = 60_000;
const debutMinuteCourante = () => Math.floor(Date.now() / UNE_MINUTE_MS) * UNE_MINUTE_MS;

/**
 * Fournit l'heure courante, rafraichie au changement de minute.
 *
 * Les queries Convex qui calculent la vague reçoivent ainsi un argument qui
 * change avec le temps, même lorsqu'aucune donnée en base n'est modifiée.
 */
export function useMaintenantMinute(): number {
  const [maintenantMs, setMaintenantMs] = useState(debutMinuteCourante);

  useEffect(() => {
    let intervalle: ReturnType<typeof setInterval> | undefined;
    const delaiProchaineMinute = UNE_MINUTE_MS - (Date.now() % UNE_MINUTE_MS);

    const timeout = window.setTimeout(() => {
      setMaintenantMs(debutMinuteCourante());
      intervalle = setInterval(() => setMaintenantMs(debutMinuteCourante()), UNE_MINUTE_MS);
    }, delaiProchaineMinute);

    return () => {
      window.clearTimeout(timeout);
      if (intervalle !== undefined) clearInterval(intervalle);
    };
  }, []);

  return maintenantMs;
}
