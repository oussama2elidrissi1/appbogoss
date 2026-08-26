import common from './common';
import nav from './nav';
import pos2 from './pos2';
import caisseV1 from './caisseV1';
import pagesGestion from './pagesGestion';
import pagesFidelite from './pagesFidelite';
import pagesPortails from './pagesPortails';

/**
 * Dictionnaire français → arabe, fusionné par domaine. La CLÉ est la chaîne
 * française telle qu'elle apparaît dans le code ; toute clé absente retombe
 * sur le français (aucune information perdue). Les doublons entre domaines
 * sont inoffensifs (dernière valeur gagnante — garder les traductions
 * identiques).
 */
const ar: Record<string, string> = {
    ...common,
    ...nav,
    ...pos2,
    ...caisseV1,
    ...pagesGestion,
    ...pagesFidelite,
    ...pagesPortails,
};

export default ar;
