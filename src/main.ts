import './index.css';
import { createCupConjurerGame } from './game/createGame';
import { initPlayablesSave } from './game/playables/playablesSave';

const rootElement = document.getElementById('root');
if (rootElement) {
  void initPlayablesSave().then(() => {
    createCupConjurerGame(rootElement);
  });
}
