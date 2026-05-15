import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { StartScene } from './scenes/StartScene';

export function createCupConjurerGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: '100%',
    height: '100%',
    backgroundColor: '#12081c',
    render: {
      antialias: true,
      antialiasGL: true,
      pixelArt: false,
      roundPixels: true,
      mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    },
    // Explicitly set resolution for high-DPI mobile screens. 
    // We cast to any because some Phaser 4 type definitions are missing this top-level property.
    ...({ resolution: window.devicePixelRatio || 1 } as any),
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [StartScene, GameScene],
  });
}
