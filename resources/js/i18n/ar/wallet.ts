/**
 * Portefeuille, Trésorerie, paiements employés — français → arabe.
 *
 * Le module Wallet est né après le premier bundle arabe : ses chaînes n'y
 * figuraient pas et retombaient toutes sur le français. Ce fichier les couvre,
 * pour le web ET pour l'application mobile, qui charge le même dictionnaire
 * (exporté en JSON dans ses assets).
 */
const wallet: Record<string, string> = {
    // ------------------------------------------------------------ Navigation
    'Mon portefeuille': 'محفظتي',
    'Trésorerie': 'الخزينة',
    "L'argent qui vous reste, ce que vous avez remis au patron, vos dépenses et votre fond de caisse.":
        'المال المتبقي لديك، وما سلّمته للمالك، ومصاريفك، وصندوق النقد الخاص بك.',
    "Où se trouve l'argent : chez le patron, chez chaque admin, en fond de caisse, chez les employés ou déjà dépensé.":
        'أين يوجد المال: عند المالك، عند كل مسؤول، في صندوق النقد، عند الموظفين أو أُنفق بالفعل.',

    // -------------------------------------------------------- Page portefeuille
    'Solde du portefeuille': 'رصيد المحفظة',
    'Suivi du portefeuille depuis le {date}': 'تتبع المحفظة منذ {date}',
    'Les rapports antérieurs restent disponibles dans « Rapports ».':
        'التقارير السابقة تبقى متاحة في «التقارير».',
    'Résultats de caisse reçus': 'نتائج الصندوق المستلمة',
    'Envoyé au Super Admin': 'أُرسل إلى المدير العام',
    'Fond de caisse': 'صندوق النقد',
    'Solde disponible': 'الرصيد المتاح',
    'Total détenu (disponible + fond de caisse)': 'الإجمالي المحتفظ به (المتاح + صندوق النقد)',
    'Payer un employé': 'دفع لموظف',
    'Ajouter une dépense': 'إضافة مصروف',
    'Affecter au fond de caisse': 'تخصيص لصندوق النقد',
    'Reprendre du fond de caisse': 'استرجاع من صندوق النقد',
    'Anomalie : le solde ne correspond pas à la somme des mouvements. Prévenez le Super Admin.':
        'خلل: الرصيد لا يطابق مجموع الحركات. أبلغ المدير العام.',
    'Argent détenu, remis et dépensé': 'المال المحتفظ به والمسلَّم والمنفق',

    // ------------------------------------------------------------- Historique
    'Historique des mouvements': 'سجل الحركات',
    'Tous les types': 'كل الأنواع',
    'Montant min.': 'الحد الأدنى للمبلغ',
    'Montant max.': 'الحد الأقصى للمبلغ',
    'Journée de caisse': 'يوم الصندوق',
    'Réinitialiser': 'إعادة تعيين',
    'Tout afficher': 'عرض الكل',
    'Aucun mouvement sur cette sélection.': 'لا حركات في هذا التحديد.',
    'Aucun mouvement.': 'لا حركات.',
    'Aucun mouvement sur votre portefeuille.': 'لا حركات في محفظتك.',
    'Aucun mouvement sur ce portefeuille.': 'لا حركات في هذه المحفظة.',
    'Solde : {amount}': 'الرصيد: {amount}',
    'Source : Portefeuille Admin': 'المصدر: محفظة المسؤول',
    'Correction': 'تصحيح',

    // Libellés de types (WalletTransactionResource les envoie en français)
    'Résultat de caisse': 'نتيجة الصندوق',
    'Envoi au Super Admin': 'إرسال إلى المدير العام',
    "Reçu d'un Admin": 'مستلم من مسؤول',
    'Reçu du Super Admin': 'مستلم من المدير العام',
    'Envoyé à un Admin': 'أُرسل إلى مسؤول',
    'Apport du patron': 'إيداع المالك',
    'Paiement employé': 'دفعة لموظف',
    'Dépense': 'مصروف',
    'Affecté au fond de caisse': 'خُصص لصندوق النقد',
    'Fond de caisse repris': 'استُرجع من صندوق النقد',
    'Reprise de fond de caisse': 'استرجاع من صندوق النقد',
    'Ajustement': 'تسوية',

    // ------------------------------------------------------ Source du paiement
    'Source du paiement': 'مصدر الدفع',
    'Portefeuille Admin': 'محفظة المسؤول',
    'Caisse du jour': 'صندوق اليوم',
    'Aucune sortie enregistrée': 'لا يوجد إخراج مسجل',
    'Ce paiement sera débité uniquement de votre portefeuille. Il ne modifiera ni le résultat de caisse, ni la journée ouverte.':
        'سيُخصم هذا الدفع من محفظتك فقط، ولن يغيّر نتيجة الصندوق ولا اليوم المفتوح.',
    'Cette opération réduira le résultat de caisse de la journée ouverte.':
        'ستُخفض هذه العملية نتيجة صندوق اليوم المفتوح.',
    "Cette dépense sera débitée uniquement de votre portefeuille. Elle n'entre pas dans les dépenses de la caisse.":
        'سيُخصم هذا المصروف من محفظتك فقط، ولا يدخل ضمن مصاريف الصندوق.',
    "L'argent reste chez vous : il passe du disponible au fond de caisse. La caisse du jour n'est pas touchée.":
        'يبقى المال عندك: ينتقل من المتاح إلى صندوق النقد، دون المساس بصندوق اليوم.',
    "Le montant repasse du fond de caisse vers votre disponible. La caisse du jour n'est pas touchée.":
        'يعود المبلغ من صندوق النقد إلى رصيدك المتاح، دون المساس بصندوق اليوم.',
    "Le montant quitte votre portefeuille pour celui du patron. La caisse du jour n'est pas touchée.":
        'يغادر المبلغ محفظتك إلى محفظة المالك، دون المساس بصندوق اليوم.',

    // --------------------------------------------------------- Modale paiement
    'Montant (DH)': 'المبلغ (درهم)',
    'Sélectionner': 'اختيار',
    'Période concernée': 'الشهر المعني',
    "Le mois que ce paiement solde. Facultatif — le mouvement, lui, est daté d'aujourd'hui.":
        'الشهر الذي تسدده هذه الدفعة. اختياري — أما الحركة فتُؤرخ باليوم.',
    'Salaire': 'راتب',
    'Commission': 'عمولة',
    'Avance': 'سلفة',
    'Prime': 'مكافأة',
    "L'employé reste redevable : elle sera déduite de sa prochaine paie.":
        'يبقى الموظف مدينًا بها: ستُخصم من أجرته القادمة.',
    'Solde actuel': 'الرصيد الحالي',
    'Après opération': 'بعد العملية',
    'Après paiement': 'بعد الدفع',
    'Montant ramené à votre solde disponible. Vous pourrez verser le reste plus tard.':
        'خُفض المبلغ إلى رصيدك المتاح. يمكنك دفع الباقي لاحقًا.',
    'Renvoyez pour confirmer cette opération malgré tout.':
        'أعد الإرسال لتأكيد هذه العملية رغم التنبيه.',
    'Renvoyez pour confirmer un second transfert identique.':
        'أعد الإرسال لتأكيد تحويل ثانٍ مطابق.',
    'Assurance, batterie, tailleur…': 'تأمين، بطارية، خياط…',
    'N° de facture, reçu…': 'رقم الفاتورة، الإيصال…',

    // -------------------------------------------------- Dû / versé / reste
    'Déjà enregistré pour {period}': 'المسجل مسبقًا لشهر {period}',
    'Déjà enregistré': 'المسجل مسبقًا',
    'Commission gagnée': 'العمولة المكتسبة',
    'Déjà payé': 'المدفوع مسبقًا',
    'Reste à payer': 'المتبقي للدفع',
    'Reste après ce paiement': 'المتبقي بعد هذه الدفعة',
    'dont {amount} sortis de la caisse': 'منها {amount} خرجت من الصندوق',
    'Ce montant dépasse le reste à payer ({remaining}). Le serveur demandera une confirmation explicite.':
        'هذا المبلغ يتجاوز المتبقي للدفع ({remaining}). سيطلب النظام تأكيدًا صريحًا.',
    "Aucun montant de référence pour ce motif : le salon n'enregistre pas de salaire fixe. Vérifiez les versements ci-dessus avant de confirmer.":
        'لا مبلغ مرجعي لهذا السبب: الصالون لا يسجل راتبًا ثابتًا. راجع الدفعات أعلاه قبل التأكيد.',

    // ------------------------------------------------------ Reste à payer (liste)
    'Reste à payer aux employés': 'المتبقي للموظفين',
    'restant pour {count} employé(s)': 'متبقٍ لـ {count} موظف(ين)',
    'Mois': 'الشهر',
    'Commission due': 'العمولة المستحقة',
    'Versé': 'المدفوع',
    'Reste': 'المتبقي',
    'Avances en cours': 'السلف الجارية',
    'avance en cours {amount}': 'سلفة جارية {amount}',
    'dont {amount} de mois précédents': 'منها {amount} من أشهر سابقة',
    "Les avances en cours incluent {amount} d'acomptes de mois précédents, toujours non soldés. La paie les déduit tant qu'ils ne le sont pas.":
        'تشمل السلف الجارية {amount} من دفعات أشهر سابقة لم تُسوَّ بعد، ويخصمها الراتب حتى تُسوى.',
    'Inactif': 'غير نشط',
    'Payer': 'دفع',
    'Aucune commission gagnée ni versement enregistré sur ce mois.':
        'لا عمولة مكتسبة ولا دفعات مسجلة في هذا الشهر.',
    'Employés concernés': 'الموظفون المعنيون',
    'Reste à verser': 'المتبقي للتسليم',

    // ------------------------------------------------------------- Trésorerie
    'Solde patron': 'رصيد المالك',
    'Suivi depuis le {date}': 'التتبع منذ {date}',
    'Total reçu des Admins': 'إجمالي المستلم من المسؤولين',
    "Reçu aujourd'hui": 'المستلم اليوم',
    'Reçu ce mois': 'المستلم هذا الشهر',
    'Apporté par le patron': 'ما أودعه المالك',
    'Renvoyé aux Admins': 'المعاد إلى المسؤولين',
    'Charger mon portefeuille': 'شحن محفظتي',
    'Envoyer à un Admin': 'إرسال إلى مسؤول',
    'Encore détenu par les Admins': 'ما يزال عند المسؤولين',
    '{count} portefeuille(s)': '{count} محفظة/محافظ',
    'Total fonds de caisse': 'إجمالي صناديق النقد',
    'Argent détenu, jamais remis au patron': 'مال محتفظ به، لم يُسلَّم للمالك',
    'Payé aux employés': 'المدفوع للموظفين',
    'Argent réellement sorti, pas ce qui est dû': 'المال الذي خرج فعلًا، لا المستحق',
    'Dépenses Wallet': 'مصاريف المحفظة',
    'Charges payées sur les portefeuilles, hors salaires': 'أعباء دُفعت من المحافظ، دون الرواتب',
    'Résultats de caisse encaissés': 'نتائج الصندوق المحصلة',
    'Par administrateur': 'حسب المسؤول',
    'Compte': 'الحساب',
    'Disponible': 'المتاح',
    'Reçu du patron': 'المستلم من المالك',
    'Payé employés': 'المدفوع للموظفين',
    'Détail': 'التفاصيل',
    "Aucun portefeuille pour l'instant. Le premier naît à la clôture d'une journée de caisse.":
        'لا محافظ حتى الآن. الأولى تنشأ عند إقفال يوم الصندوق.',
    'Historique du portefeuille patron': 'سجل محفظة المالك',
    'Historique complet': 'السجل الكامل',
    'Historique du portefeuille': 'سجل المحفظة',
    'Portefeuilles de tout le salon': 'محافظ الصالون كلها',
    'Admin destinataire': 'المسؤول المستلم',
    'Motif (facultatif)': 'السبب (اختياري)',
    'Apport espèces, virement…': 'إيداع نقدي، تحويل…',
    'Réapprovisionnement caisse…': 'تزويد الصندوق…',
    "De l'argent qui entre dans le système sans venir d'une journée de caisse. Le motif est obligatoire : c'est tout ce qui restera pour l'expliquer.":
        'مال يدخل النظام دون أن يأتي من يوم صندوق. السبب إلزامي: هو كل ما سيبقى لتفسيره.',
    "Le montant quitte votre portefeuille et arrive dans celui de l'Admin, en une seule opération.":
        'يغادر المبلغ محفظتك ويصل إلى محفظة المسؤول في عملية واحدة.',
    'Le montant quitte votre portefeuille et arrive dans celui du patron, en une seule opération.':
        'يغادر المبلغ محفظتك ويصل إلى محفظة المالك في عملية واحدة.',
    "L'argent sort de votre portefeuille. Les commissions et la paie mensuelle continuent de dire ce qui est dû : ceci enregistre ce qui est réellement sorti.":
        'يخرج المال من محفظتك. تبقى العمولات والراتب الشهري بيانًا لما هو مستحق: هنا يُسجل ما خرج فعلًا.',

    // ------------------------------------------------------- Fiche employé
    'Paiements': 'الدفعات',
    'Total payé': 'إجمالي المدفوع',
    'Dont portefeuille': 'منه من المحفظة',
    'Dont caisse': 'منه من الصندوق',
    'Dernier paiement': 'آخر دفعة',
    'Source': 'المصدر',
    'Motif': 'السبب',
    'Wallet': 'المحفظة',
    'Caisse': 'الصندوق',
    'journée du': 'يوم',
    "Aucun versement enregistré pour cet employé, ni depuis un portefeuille, ni depuis la caisse.":
        'لا دفعات مسجلة لهذا الموظف، لا من محفظة ولا من الصندوق.',
    'Historique des paiements': 'سجل الدفعات',

    // ------------------------------------------------------------------ Paie
    'Versé pour ce mois': 'المدفوع لهذا الشهر',
    'paies, portefeuille et avances du mois': 'رواتب الشهر ومحفظته وسلفه',
    'Avances reportées': 'سلف مرحّلة',
    'de mois précédents, toujours déduites': 'من أشهر سابقة، وتُخصم دائمًا',
    "Aucune journée de caisse ouverte : ce versement sera enregistré sans sortie de caisse. Pour tracer l'argent réellement remis, utilisez « Mon portefeuille → Payer un employé ».":
        'لا يوم صندوق مفتوح: ستُسجل هذه الدفعة دون إخراج من الصندوق. لتتبع المال المسلَّم فعلًا، استعمل «محفظتي ← دفع لموظف».',
    "Le mois sera marqué payé sans qu'aucune sortie d'argent ne soit enregistrée. Pour tracer la remise, utilisez « Mon portefeuille → Payer un employé ».":
        'سيُعلَّم الشهر مدفوعًا دون تسجيل أي إخراج للمال. لتتبع التسليم، استعمل «محفظتي ← دفع لموظف».',
    "Aucune journée de caisse ouverte. Choisissez une journée ci-dessous, ou payez depuis « Mon portefeuille → Payer un employé », qui reste disponible caisse fermée.":
        'لا يوم صندوق مفتوح. اختر يومًا أدناه، أو ادفع من «محفظتي ← دفع لموظف» المتاح حتى والصندوق مغلق.',
    'Cette opération réduira le résultat de caisse de la journée concernée.':
        'ستُخفض هذه العملية نتيجة صندوق اليوم المعني.',

    // ------------------------------------------- Rapports : statut portefeuille
    'Portefeuille crédité': 'قُيّد في المحفظة',
    'vers le portefeuille de {name}': 'إلى محفظة {name}',
    'Crédit contre-passé': 'قيد معكوس',
    'Crédit réattribué': 'قيد معاد إسناده',
    'Un ajustement a annulé ce crédit ; les deux mouvements restent dans l’historique.':
        'ألغت تسويةٌ هذا القيد؛ وتبقى الحركتان في السجل.',
    'Hors portefeuille': 'خارج المحفظة',
    'Journée antérieure au {date} : elle reste dans les rapports, sans alimenter aucun solde.':
        'يوم سابق لتاريخ {date}: يبقى في التقارير دون أن يغذي أي رصيد.',
    'Aucun mouvement': 'لا حركة',
    'Résultat nul : rien à créditer.': 'نتيجة صفرية: لا شيء يُقيَّد.',
    'Non crédité': 'غير مقيَّد',
    "Aucun responsable identifié pour cette journée — à signaler au Super Admin.":
        'لا مسؤول محدد لهذا اليوم — يُبلَّغ به المدير العام.',
    'En attente de clôture': 'في انتظار الإقفال',
    'Le résultat sera crédité au portefeuille à la clôture de la journée.':
        'ستُقيَّد النتيجة في المحفظة عند إقفال اليوم.',
    'Suivi du portefeuille depuis le 1 septembre 2026. Les mois précédents restent consultables dans les rapports.':
        'تتبع المحفظة منذ 1 شتنبر 2026. تبقى الأشهر السابقة قابلة للاطلاع في التقارير.',

    // ------------------------------------------------- Divers mobile
    'Mouvement enregistré.': 'سُجلت الحركة.',
    'Opération refusée': 'رُفضت العملية',
    'Indiquez un montant.': 'أدخل مبلغًا.',
    'Montant invalide.': 'مبلغ غير صالح.',
    'Le montant doit être positif.': 'يجب أن يكون المبلغ موجبًا.',
    'Décrivez la dépense.': 'صف المصروف.',
    'Indiquez le motif de cet apport.': 'أدخل سبب هذا الإيداع.',
    'Note (facultatif)': 'ملاحظة (اختياري)',
    'Référence (facultatif)': 'مرجع (اختياري)',
    'Type de paiement': 'نوع الدفع',
    'Toute la période': 'كل الفترة',
    'Confirmer le paiement': 'تأكيد الدفع',
    'Envoyer': 'إرسال',
    'Charger': 'شحن',
    'Affecter': 'تخصيص',
    'Reprendre': 'استرجاع',
    'Enregistrer la dépense': 'حفظ المصروف',
    'Anomalie de solde': 'خلل في الرصيد',
    'SOLDE DU PORTEFEUILLE': 'رصيد المحفظة',
    'WALLET SUPER ADMIN': 'محفظة المدير العام',
    'Caisse V2': 'الصندوق 2',

    // ------------------------------------------ Rapports mobiles + divers
    'Journée du {date}': 'يوم {date}',
    'Journées de caisse et totaux': 'أيام الصندوق والمجاميع',
    'Documents PDF': 'مستندات PDF',
    'tickets': 'تذاكر',
    'Aucune journée': 'لا أيام',
    'Aucune journée de caisse sur ce mois.': 'لا أيام صندوق في هذا الشهر.',
    'Ouverte': 'مفتوح',
    'Clôturée': 'مُقفل',
    'CA': 'رقم المعاملات',
    'Avances': 'السلف',
    'Résultat de la caisse': 'نتيجة الصندوق',
    'Langue': 'اللغة',
    'Montant': 'المبلغ',
    'Envoyer au Super Admin': 'إرسال إلى المدير العام',
    'Employé': 'الموظف',
    'Portefeuille': 'المحفظة',
    'Google Play Test': 'حساب تجريبي Google Play',
    'Compte de démonstration Google Play : cette action est désactivée.': 'حساب تجريبي Google Play: هذا الإجراء معطل.',
};

export default wallet;
