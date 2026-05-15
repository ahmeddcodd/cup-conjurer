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
    pixelArt: false,
    antialias: true,
    roundPixels: true,
    resolution: window.devicePixelRatio || 1,
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [StartScene, GameScene],
  });
}
