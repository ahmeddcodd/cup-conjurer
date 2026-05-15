import './index.css';
import { createCupConjurerGame } from './game/createGame';

const rootElement = document.getElementById('root');
if (rootElement) {
  createCupConjurerGame(rootElement);
}
