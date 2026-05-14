import { useEffect, useRef } from 'react';
import { createCupConjurerGame } from '../game/createGame';

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const game = createCupConjurerGame(host);
    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="phaser-host" />;
}
