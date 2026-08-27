/** Dictionnaire français → arabe (lot missingE : rapports, libellés dynamiques agenda/abonnements/fidélité, connexion — relevés par le scan de couverture). Clé = chaîne française exacte du code. */
const missingE: Record<string, string> = {
    // --- pages/Reports (libellés ASCII des exports/stat cards) ---
    'Resultat de la caisse': 'نتيجة الصندوق',
    'Employes par CA et prestation': 'الموظفون حسب رقم المعاملات والخدمة',
    'Prestations par employe': 'الخدمات حسب الموظف',
    'Depenses detaillees': 'المصاريف بالتفصيل',
    'Avances detaillees': 'السلف بالتفصيل',
    'Historique journee par journee': 'السجل يومًا بيوم',
    'Journées': 'اليوميات',
    'Clôturées': 'المغلقة',
    'CA historique': 'رقم المعاملات التاريخي',
    'Résultat historique': 'النتيجة التاريخية',

    // --- components/reports ---
    'Total avances': 'مجموع السلف',
    'Réglées': 'مسوّاة',
    'Total commissions': 'مجموع العمولات',
    'Commissions annulées': 'عمولات ملغاة',

    // --- components/layout/Sidebar ---
    'Logo': 'الشعار',
    'Déplier le menu': 'توسيع القائمة',
    'Replier le menu': 'طي القائمة',

    // --- components/agenda ---
    'Créneau indisponible': 'الموعد غير متاح',
    'Service indisponible': 'الخدمة غير متاحة',
    'Capacité complète': 'الطاقة الاستيعابية ممتلئة',
    'Informations incorrectes': 'معلومات غير صحيحة',
    'Toutes': 'الكل',
    'Confirmées': 'مؤكَّدة',
    'Terminées': 'منتهية',
    'réservations': 'حجوزات',
    'réservation': 'حجز',

    // --- components/workday/EmployeeFormDialog ---
    'services sélectionnés': 'خدمات محدَّدة',
    'service sélectionné': 'خدمة محدَّدة',
    'Nouvel employé': 'موظف جديد',
    "Modifier l'employé": 'تعديل الموظف',

    // --- pages/Abonnements ---
    'Actifs': 'نشطة',
    'Suspendus': 'معلَّقة',
    'Expirés': 'منتهية',
    'Annulés': 'ملغاة',
    'Abonnés': 'المشتركون',
    'Rapports': 'التقارير',

    // --- pages/ClientDetail ---
    'Accès configuré (téléphone + mot de passe)': 'الوصول مُهيَّأ (الهاتف + كلمة المرور)',
    'Aucun accès configuré': 'لا يوجد وصول مُهيَّأ',
    'Consentement marketing accordé': 'تم منح الموافقة التسويقية',
    'Pas de consentement marketing': 'لا توجد موافقة تسويقية',
    'récompenses disponibles': 'مكافآت متاحة',
    'récompense disponible': 'مكافأة متاحة',
    'Régénérer': 'إعادة الإنشاء',
    'Générer': 'إنشاء',

    // --- pages/LoyaltyPrograms (types de programme) ---
    'Nombre de services': 'عدد الخدمات',
    'Points': 'النقاط',
    'Montant dépensé': 'المبلغ المُنفق',
    'Nombre de visites': 'عدد الزيارات',
    'Anniversaire': 'عيد الميلاد',
    'Personnalisé': 'مخصص',

    // --- pages/partner/PartnerClients ---
    'Archivés': 'المؤرشفون',

    // --- pages/Login (compléments) ---
    "Besoin d'aide ?": 'تحتاج مساعدة؟',
    'Contactez votre administrateur.': 'تواصل مع مديرك.',
    'Tous droits réservés.': 'جميع الحقوق محفوظة.',
};

export default missingE;
