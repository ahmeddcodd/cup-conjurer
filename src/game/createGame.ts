import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { StartScene } from './scenes/StartScene';

export function createCupConjurerGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL, // Prefer WebGL for better mobile performance and clarity
    parent,
    width: '100%',
    height: '100%',
    backgroundColor: '#12081c',
    render: {
      antialias: false, // Disabling antialias on High-DPI mobile makes text and edges much sharper
      antialiasGL: false,
      pixelArt: false,
      roundPixels: true,
      powerPreference: 'high-performance', // Request maximum GPU power on mobile
      mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    },
    // Ensure we use the physical pixel density of the mobile device
    ...({ resolution: window.devicePixelRatio || 1 } as any),
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [StartScene, GameScene],
  });
}
