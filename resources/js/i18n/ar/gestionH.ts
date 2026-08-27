/** Dictionnaire français → arabe (lot gestionH : équipe, fiche employé, QR code d'inscription). Clé = chaîne française exacte du code. */
const gestionH: Record<string, string> = {
    // --- pages/Employees ---
    "Impossible de charger l'équipe": 'تعذّر تحميل الفريق',
    'Équipe': 'الفريق',
    'Fiches employés, statut, commissions et avances sur salaire.': 'بطاقات الموظفين، الحالة، العمولات والسلف على الأجر.',
    'Rechercher un employé...': 'البحث عن موظف...',
    'Actifs': 'نشطون',
    'Inactifs': 'غير نشطين',
    'Aucun employé': 'لا يوجد موظفون',
    'Ajoutez une fiche employé pour ouvrir une journée et suivre les commissions.': 'أضف بطاقة موظف لفتح يومية ومتابعة العمولات.',
    'Modifier': 'تعديل',
    'Compte employé': 'حساب موظف',
    'commission': 'عمولة',
    'Inactif': 'غير نشط',
    'Créer un compte': 'إنشاء حساب',
    'Voir la fiche': 'عرض البطاقة',
    'Supprimer cet employé ?': 'حذف هذا الموظف؟',
    '{name} sera définitivement supprimé(e). Cette action est irréversible.': 'سيتم حذف {name} نهائيًا. هذا الإجراء لا رجعة فيه.',

    // --- pages/EmployeeDetail ---
    'Impossible de charger cette fiche': 'تعذّر تحميل هذه البطاقة',
    'Retour': 'رجوع',
    'Retour à l’équipe': 'العودة إلى الفريق',
    'Paie': 'الأجور',

    // --- pages/LoyaltyQr ---
    'QR Code d’inscription': 'رمز QR للتسجيل',
    'À afficher ou imprimer au salon — les clients scannent pour rejoindre le programme de fidélité.': 'للعرض أو الطباعة في الصالون — يمسح الزبناء الرمز للانضمام إلى برنامج الولاء.',
    'Inscriptions ouvertes': 'التسجيلات مفتوحة',
    'Inscriptions fermées': 'التسجيلات مغلقة',
    'Nouveau QR Code généré — les anciens ne fonctionnent plus.': 'تم إنشاء رمز QR جديد — الرموز القديمة لم تعد تعمل.',
    'Réimprimez la nouvelle affiche et remplacez tous les QR affichés au salon (comptoir, vitrine, cabines…).': 'أعد طباعة الملصق الجديد واستبدل جميع رموز QR المعروضة في الصالون (الاستقبال، الواجهة، الغرف…).',
    'Imprimer la nouvelle affiche': 'طباعة الملصق الجديد',
    "QR Code d'inscription BOGOSLAND": 'رمز QR للتسجيل في BOGOSLAND',
    'Télécharger en PNG': 'تحميل بصيغة PNG',
    'Imprimer l’affiche': 'طباعة الملصق',
    'Afficher à l’écran (animé)': 'عرض على الشاشة (متحرك)',
    'Régénérer le lien': 'إعادة إنشاء الرابط',
    'Lien d’inscription': 'رابط التسجيل',
    'Ce QR est permanent': 'هذا الرمز دائم',
    '— il ne change jamais tout seul. Il n’est invalidé que si vous cliquez « Régénérer le lien », auquel cas toutes les affiches imprimées devront être remplacées — à réserver au cas où le QR aurait été compromis ou perdu.':
        '— لا يتغير أبدًا من تلقاء نفسه. لا يُلغى إلا إذا نقرتم على « إعادة إنشاء الرابط »، وعندها يجب استبدال جميع الملصقات المطبوعة — يُستخدم فقط إذا تم اختراق الرمز أو فقدانه.',
    'Inscriptions publiques': 'التسجيلات العامة',
    'Désactivez temporairement le scan sans supprimer le lien (ex. maintenance).': 'عطّل المسح مؤقتًا دون حذف الرابط (مثلًا أثناء الصيانة).',
    'Désactiver les inscriptions': 'تعطيل التسجيلات',
    'Activer les inscriptions': 'تفعيل التسجيلات',
    'Régénérer le QR Code ?': 'إعادة إنشاء رمز QR؟',
    'Attention : si vous régénérez, tous les QR déjà imprimés cesseront immédiatement de fonctionner. Vous devrez réimprimer la nouvelle affiche et remplacer chaque QR affiché dans le salon (comptoir, vitrine, cabines…). Le QR actuel, lui, ne change jamais tant que vous ne le régénérez pas.':
        'تنبيه: إذا أعدتم إنشاء الرمز، ستتوقف جميع رموز QR المطبوعة عن العمل فورًا. سيتعين عليكم إعادة طباعة الملصق الجديد واستبدال كل رمز معروض في الصالون (الاستقبال، الواجهة، الغرف…). أما الرمز الحالي فلا يتغير أبدًا ما لم تعيدوا إنشاءه.',
    'Je comprends, régénérer': 'فهمت، إعادة الإنشاء',
};

export default gestionH;
