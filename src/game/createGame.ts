import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './displayProfile';
import { GameScene } from './scenes/GameScene';
import { StartScene } from './scenes/StartScene';

export function createCupConjurerGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    backgroundColor: '#12081c',
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    scale: {
      // EXPAND: CSS-fits the parent (full #root) and grows the canvas buffer when possible.
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
    },
    callbacks: {
      postBoot: (bootedGame) => {
        Phaser.Display.Canvas.CanvasInterpolation.setBicubic(bootedGame.canvas);
      },
    },
    scene: [StartScene, GameScene],
  });

  return game;
}
