import common from './common';
import nav from './nav';
import pos2 from './pos2';
import caisseV1 from './caisseV1';
import caisseV1b from './caisseV1b';
import pagesGestion from './pagesGestion';
import gestionA from './gestionA';
import gestionB from './gestionB';
import gestionC from './gestionC';
import gestionD from './gestionD';
import pagesFidelite from './pagesFidelite';
import fideliteA from './fideliteA';
import fideliteB from './fideliteB';
import pagesPortails from './pagesPortails';
import portailsA from './portailsA';
import portailsB from './portailsB';
import caisseV1c from './caisseV1c';
import gestionE from './gestionE';
import gestionF from './gestionF';
import employeeA from './employeeA';
import employeeB from './employeeB';
import gestionG from './gestionG';
import employeeC from './employeeC';
import gestionH from './gestionH';
import gestionI from './gestionI';
import gestionJ from './gestionJ';
import partnersC from './partnersC';
import partnersD from './partnersD';
import missingA from './missingA';
import missingB from './missingB';
import missingC from './missingC';
import missingD from './missingD';
import loginA from './loginA';
import missingE from './missingE';

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
    ...caisseV1b,
    ...pagesGestion,
    ...gestionA,
    ...gestionB,
    ...gestionC,
    ...gestionD,
    ...pagesFidelite,
    ...fideliteA,
    ...fideliteB,
    ...pagesPortails,
    ...portailsA,
    ...portailsB,
    ...caisseV1c,
    ...gestionE,
    ...gestionF,
    ...employeeA,
    ...employeeB,
    ...gestionG,
    ...employeeC,
    ...gestionH,
    ...gestionI,
    ...gestionJ,
    ...partnersC,
    ...partnersD,
    ...missingA,
    ...missingB,
    ...missingC,
    ...missingD,
    ...loginA,
    ...missingE,
};

export default ar;
