import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { StartScene } from './scenes/StartScene';

const LOGICAL_WIDTH = 720;
const LOGICAL_HEIGHT = 1280;

export function createCupConjurerGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    backgroundColor: '#12081c',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [StartScene, GameScene],
  });
}
