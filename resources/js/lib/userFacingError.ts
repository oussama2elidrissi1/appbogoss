/**
 * Une erreur dont le message est écrit POUR l'utilisateur.
 *
 * `getErrorMessage()` répond par un message générique à tout ce qui n'est pas
 * une réponse d'API : c'est volontaire, le texte d'une exception technique
 * n'a rien à faire sous les yeux d'une caissière. Cette classe est la
 * dérogation explicite — une erreur levée côté navigateur dont le texte a été
 * rédigé pour être lu, comme les contrôles de la caisse de test qui rejouent
 * ceux du serveur.
 */
export class UserFacingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UserFacingError';
    }
}
