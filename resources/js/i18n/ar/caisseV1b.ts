/** Dictionnaire français → arabe (lot caisseV1b). Clé = chaîne française exacte du code. */
const caisseV1b: Record<string, string> = {
    // --- workday/CreatedAccountDialog ---
    'Compte créé': 'تم إنشاء الحساب',
    'Communiquez ces identifiants à {name} — ils ne seront plus affichés ensuite.': 'أبلغ {name} ببيانات الدخول هذه — لن تُعرض مرة أخرى بعد ذلك.',
    'Email de connexion': 'البريد الإلكتروني لتسجيل الدخول',
    'Mot de passe': 'كلمة المرور',
    'Terminé': 'منتهٍ',

    // --- workday/CredentialRow ---
    'Copier {x}': 'نسخ {x}',

    // --- workday/PatronPasswordDialog ---
    'Supprimer définitivement': 'حذف نهائي',
    'Cette action est irréversible. Le mot de passe patron est requis.': 'هذا الإجراء لا رجعة فيه. كلمة مرور صاحب المحل مطلوبة.',
    'Mot de passe patron': 'كلمة مرور صاحب المحل',
    'Annuler': 'إلغاء',
    // --- workday/EmployeePayroll ---
    'Commission & paie': 'العمولة والأجور',
    'Commission': 'العمولة',
    'Avances': 'التسبيقات',
    'Payé ce mois': 'مدفوع هذا الشهر',
    'Net à payer': 'الصافي المستحق',
    'Payé le {date}': 'مدفوع بتاريخ {date}',
    'Payé': 'مدفوع',
    'Payer le reste': 'دفع الباقي',
    'Marquer comme payé': 'تحديد كمدفوع',
    'Rien à payer': 'لا شيء مستحق للدفع',
    'Historique des paiements': 'سجل المدفوعات',
    'Marquer cette commission comme payée ?': 'تحديد هذه العمولة كمدفوعة؟',
    "La commission restante de {name} ({remaining}) a déjà été entièrement versée en avances — les {advances} d'avances seront soldées et {period} sera marqué payé (0 MAD à verser).":
        'العمولة المتبقية لـ {name} ({remaining}) سبق صرفها بالكامل على شكل سلف — ستتم تسوية السلف البالغة {advances} وسيُحدد شهر {period} كمدفوع (0 درهم للصرف).',
    '{amount} seront enregistrés comme payés à {name} pour {period}': 'سيُسجل مبلغ {amount} كمدفوع لـ {name} عن شهر {period}',
    ", et {advances} d'avances en cours seront soldées automatiquement.": '، وستتم تسوية السلف الجارية البالغة {advances} تلقائيًا.',
    'Cette action ne peut pas être annulée depuis cette page.': 'لا يمكن التراجع عن هذا الإجراء من هذه الصفحة.',
    "Sortir {amount} de la caisse du jour — enregistré comme une avance déjà soldée, rattachée à cette paie. Décochez si l'argent ne sort pas de la caisse (virement, autre source).":
        'إخراج {amount} من صندوق اليوم — يُسجل كسلفة مسوّاة مسبقًا ومرتبطة بهذه الأجور. ألغِ التحديد إذا كان المال لا يخرج من الصندوق (تحويل بنكي، مصدر آخر).',
};

export default caisseV1b;
