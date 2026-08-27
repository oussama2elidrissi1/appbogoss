/** Dictionnaire français → arabe (lot employeeC : tableau de bord, commissions et layout de l'espace employé). Clé = chaîne française exacte du code (y compris les libellés sans accents). */
const employeeC: Record<string, string> = {
    // --- pages/employee/EmployeeDashboard ---
    'vs hier': 'مقارنة بالأمس',
    'Prestations payees': 'خدمات مدفوعة',
    'Validee': 'مُصادَق عليها',
    'Mois courant': 'الشهر الجاري',
    'Prochain client': 'الزبون التالي',
    "Ouvrir l'agenda": 'فتح الأجندة',
    "Mes prestations aujourd'hui": 'خدماتي اليوم',
    'Voir toutes': 'عرض الكل',
    "Aucune prestation creee aujourd'hui.": 'لم تُنشأ أي خدمة اليوم.',
    'Complet': 'الكل',
    "Aucun rendez-vous aujourd'hui.": 'لا توجد مواعيد اليوم.',
    'Evolution de mes commissions': 'تطور عمولاتي',
    'Repartition de mes prestations': 'توزيع خدماتي',
    'Voir tous': 'عرض الكل',
    'Conseil du jour': 'نصيحة اليوم',

    // --- pages/employee/EmployeeCommissions ---
    'Lecture seule, calculee depuis les prestations validees.': 'للقراءة فقط، محسوبة من الخدمات المُصادَق عليها.',
    'En attente': 'في الانتظار',
    'Historique': 'السجل',
    'Aucune commission.': 'لا توجد عمولات.',
    'Prix service': 'ثمن الخدمة',
    'Historique des avances': 'سجل السلف',
    'Aucune avance en historique.': 'لا توجد سلف في السجل.',
    'Historique des paiements': 'سجل المدفوعات',
    'Aucun paiement de commission.': 'لا توجد مدفوعات عمولة.',
    'Periode': 'الفترة',

    // --- pages/employee/EmployeeLayout ---
    'Outils': 'أدوات',
    'Scanner QR': 'مسح QR',
    'Accueil': 'الرئيسية',
    'Agenda': 'الأجندة',
    'Scanner': 'مسح',
    'Profil': 'الملف',
    'Employe': 'موظف',
    'Deconnexion': 'تسجيل الخروج',
    'Fermer le menu': 'إغلاق القائمة',
    'Ouvrir le menu': 'فتح القائمة',
    'Bonjour': 'مرحبًا',
    "Voici un apercu de votre activite aujourd'hui.": 'إليك لمحة عن نشاطك اليوم.',
};

export default employeeC;
