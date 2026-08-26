/** Dictionnaire français → arabe (lot gestionA). Clé = chaîne française exacte du code. */
const gestionA: Record<string, string> = {
    // ---------------------------------------------------------------- pages/Dashboard.tsx
    'Impossible de charger le tableau de bord': 'تعذر تحميل لوحة القيادة',
    'Réessayer': 'إعادة المحاولة',
    'Bonjour': 'صباح الخير',
    'Bon après-midi': 'طاب مساؤك',
    'Bonsoir': 'مساء الخير',
    'Voici l’activité de votre salon aujourd’hui.': 'إليك نشاط صالونك اليوم.',
    'CA du jour': 'رقم معاملات اليوم',
    'Journée de caisse ouverte': 'يوم الصندوق مفتوح',
    'Aucune journée ouverte': 'لا يوجد يوم مفتوح',
    'Rendez-vous': 'المواعيد',
    'Programmés aujourd’hui': 'مبرمجة اليوم',
    'Clients servis': 'الزبناء المخدومون',
    'Aujourd’hui en caisse': 'اليوم في الصندوق',
    'Clients': 'الزبناء',
    '+{n} ce mois-ci': '+{n} هذا الشهر',
    'Employés actifs': 'الموظفون النشطون',
    'En service': 'في الخدمة',
    'Dépenses du mois': 'مصاريف الشهر',
    'Charges cumulées': 'التكاليف المتراكمة',

    // ---------------------------------------------------------------- dashboard/ActiveDayCard.tsx
    'Journée en cours': 'اليوم الجاري',
    'Ouverte': 'مفتوحة',
    'employés': 'موظفين',
    'employé': 'موظف',
    'en service': 'في الخدمة',
    'fond de caisse': 'رصيد الصندوق الافتتاحي',
    'Encaissé': 'المحصَّل',
    'Dépenses': 'المصاريف',
    'Avances': 'التسبيقات',
    'Montant de la caisse': 'مبلغ الصندوق',
    'Ouvrir la caisse': 'فتح الصندوق',

    // ---------------------------------------------------------------- dashboard/LowStockCard.tsx
    'Stock faible': 'مخزون منخفض',
    'Produits sous le seuil d’alerte': 'منتجات تحت عتبة التنبيه',
    'Stock au vert': 'المخزون سليم',
    'Tous les produits sont au-dessus de leur seuil d’alerte.': 'جميع المنتجات فوق عتبة التنبيه.',
    'Stock de {name}': 'مخزون {name}',

    // ---------------------------------------------------------------- dashboard/RecentActivityCard.tsx
    'Activité récente': 'النشاط الأخير',
    'Les derniers mouvements du salon': 'آخر حركات الصالون',
    'Rien à signaler': 'لا شيء يُذكر',
    'L’activité du salon s’affichera ici au fil de la journée.': 'سيظهر نشاط الصالون هنا على مدار اليوم.',

    // ---------------------------------------------------------------- dashboard/AppointmentQueueCard.tsx
    'File d’attente': 'قائمة الانتظار',
    'Les rendez-vous d’aujourd’hui': 'مواعيد اليوم',
    'Journée libre': 'يوم خالٍ',
    'Aucun rendez-vous n’est programmé pour aujourd’hui.': 'لا يوجد أي موعد مبرمج لليوم.',
    'En attente': 'قيد الانتظار',
    'Confirmé': 'مؤكد',
    'En cours': 'جارٍ',
    'Terminé': 'منتهٍ',
    'Annulé': 'ملغى',
    'Absent': 'لم يحضر',
    'Refusé': 'مرفوض',
    'Payé': 'مدفوع',

    // ---------------------------------------------------------------- dashboard/RevenueChart.tsx
    'Recettes': 'المداخيل',
    'Évolution du chiffre d’affaires': 'تطور رقم المعاملات',
    'sur les {n} derniers jours': 'خلال الأيام الـ{n} الأخيرة',
    'Aucune donnée sur la période': 'لا توجد بيانات خلال هذه الفترة',
    '7j': '7 أيام',
    '14j': '14 يومًا',
    '30j': '30 يومًا',
    'Pas encore de données': 'لا توجد بيانات بعد',
    'Les recettes apparaîtront ici dès le premier encaissement.': 'ستظهر المداخيل هنا بمجرد أول عملية تحصيل.',
};

export default gestionA;
