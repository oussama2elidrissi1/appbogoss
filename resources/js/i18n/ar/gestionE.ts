/** Dictionnaire français → arabe (lot gestionE : formulaire partenaire, composants prestations, pages restantes). Clé = chaîne française exacte du code. */
const gestionE: Record<string, string> = {
    // --- partners/PartnerFormDialog ---
    'Modifier le partenaire': 'تعديل الشريك',
    'Nouveau partenaire': 'شريك جديد',
    'Le partenaire pourra se connecter et créer des réservations dans votre agenda. Sa commission est définie service par service — montant fixe ou pourcentage du prix.':
        'سيتمكن الشريك من تسجيل الدخول وإنشاء حجوزات في أجندتكم. تُحدَّد عمولته لكل خدمة على حدة — مبلغ ثابت أو نسبة مئوية من الثمن.',
    'Nom du partenaire *': 'اسم الشريك *',
    'Hôtel Atlas, Riad Yasmine...': 'فندق أطلس، رياض ياسمين...',
    'Nom commercial': 'الاسم التجاري',
    "Nom affiché sur l'espace partenaire": 'الاسم المعروض في فضاء الشريك',
    'Personne de contact': 'شخص الاتصال',
    'Nom du contact': 'اسم جهة الاتصال',
    'Téléphone': 'الهاتف',
    'Email de contact': 'البريد الإلكتروني للتواصل',
    'Adresse': 'العنوان',
    "Adresse de l'établissement": 'عنوان المؤسسة',
    'Compte de connexion': 'حساب الدخول',
    'Email de connexion *': 'البريد الإلكتروني لتسجيل الدخول *',
    'Nouveau mot de passe': 'كلمة مرور جديدة',
    'Mot de passe': 'كلمة المرور',
    'Laisser vide pour ne pas changer': 'اتركه فارغًا لعدم التغيير',
    'Vide = généré automatiquement': 'فارغ = يُنشأ تلقائيًا',
    'Commissions par service': 'العمولات حسب الخدمة',
    '{n} service commissionné': '{n} خدمة بعمولة',
    '{n} services commissionnés': '{n} خدمات بعمولة',
    'Activez les services que ce partenaire peut apporter et fixez sa rémunération — en % du prix ou en montant fixe (MAD).':
        'فعّل الخدمات التي يمكن لهذا الشريك جلبها وحدّد أجره — بنسبة % من الثمن أو بمبلغ ثابت (درهم).',
    'Notes': 'ملاحظات',
    'Conditions particulières, mode de règlement des commissions...': 'شروط خاصة، طريقة تسديد العمولات...',
    'Annuler': 'إلغاء',
    'Enregistrer': 'حفظ',
    'Créer le partenaire': 'إنشاء الشريك',

    // --- prestations/MyDashboardSummary ---
    "Prestations aujourd'hui": 'خدمات اليوم',
    'Chiffre du jour': 'رقم معاملات اليوم',
    'Commission du jour': 'عمولة اليوم',
    'Commission du mois': 'عمولة الشهر',

    // --- pourboires (espace employé) ---
    'Pourboires du jour': 'إكراميات اليوم',
    'Pourboires du mois': 'إكراميات الشهر',
    'Dont {x} pour vous': 'منها {x} لك',
    'Dont {x} de pourboires': 'منها {x} من الإكراميات',
    '+ {x} de pourboire': '+ {x} إكرامية',
    'Dont {x} pour vous (50% sur la coiffure), deja comptes dans vos commissions du mois.':
        'منها {x} لك (50% على الحلاقة)، محتسبة مسبقًا ضمن عمولات الشهر.',
    'Pourboire 50%': 'إكرامية 50%',
    'Pourcentage': 'نسبة مئوية',
    'Montant fixe': 'مبلغ ثابت',
    'Aucune': 'لا شيء',

    // --- prestations/MyPrestationsList ---
    'Brouillon': 'مسودة',
    'En cours': 'قيد الإنجاز',
    'Services terminés': 'الخدمات منتهية',
    'En attente de paiement': 'في انتظار الدفع',
    'Payée': 'مدفوعة',
    'Annulée': 'ملغاة',
    'Remboursée': 'مستردَّة',
    'Aucune prestation': 'لا توجد خدمات',
    'Vos prestations créées apparaîtront ici avec leur statut.': 'ستظهر هنا الخدمات التي أنشأتها مع حالتها.',
    'Client de passage': 'زبون عابر',
    'service': 'خدمة',
    'services': 'خدمات',

    // --- prestations/MyAdvancesList ---
    'Avances en cours': 'السلف الجارية',
    'Aucune avance': 'لا توجد سلف',
    'Les avances sur salaire qui vous sont données apparaîtront ici.': 'ستظهر هنا السلف على الأجر الممنوحة لك.',
    'Non réglée': 'غير مسوّاة',

    // --- prestations/MyCommissionsList ---
    "Aujourd'hui": 'اليوم',
    'Cette semaine': 'هذا الأسبوع',
    'Ce mois': 'هذا الشهر',
    'Tout': 'الكل',
    'Total :': 'المجموع :',
    'Aucune commission': 'لا توجد عمولات',
    'Vos commissions générées à la confirmation des paiements apparaîtront ici.': 'ستظهر هنا عمولاتك المُنشأة عند تأكيد المدفوعات.',
    'sur': 'من',
    'Supprimé': 'محذوف',
    'Validée': 'مُصادَق عليها',

    // --- prestations/MyReportPanel ---
    'Exporter (CSV)': 'تصدير (CSV)',
    "Chiffre d'affaires": 'رقم المعاملات',
    'Commissions': 'العمولات',
    'Prestations payées': 'الخدمات المدفوعة',
    'Ticket moyen': 'متوسط التذكرة',
    'Clients servis': 'الزبناء المخدومون',
    'Annulées / remboursées': 'ملغاة / مستردَّة',
    'Top services': 'أفضل الخدمات',
    'Détail des prestations': 'تفاصيل الخدمات',
};

export default gestionE;
