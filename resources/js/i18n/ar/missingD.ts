/** Dictionnaire français → arabe (lot missingD : portail partenaire — clients, fiche client, commissions — clés relevées par le rapport de couverture). Clé = chaîne française exacte du code. */
const missingD: Record<string, string> = {
    // --- pages/partner/PartnerClientDetail ---
    'Client introuvable.': 'الزبون غير موجود.',
    'Retour à mes clients': 'العودة إلى زبنائي',
    'Fiche client': 'بطاقة الزبون',
    'Archivé': 'مؤرشف',
    'Client depuis le {date}': 'زبون منذ {date}',
    'Désarchiver': 'إلغاء الأرشفة',
    'Archiver': 'أرشفة',
    'Activité avec vous': 'النشاط معكم',
    'Commission générée': 'العمولة المحققة',
    'Dernière réservation le {date}': 'آخر حجز في {date}',
    'Historique des réservations': 'سجل الحجوزات',
    'Aucune réservation avec ce client pour le moment.': 'لا توجد حجوزات مع هذا الزبون حتى الآن.',
    'Désarchiver ce client ?': 'إلغاء أرشفة هذا الزبون؟',
    'Archiver ce client ?': 'أرشفة هذا الزبون؟',
    '{name} réapparaîtra dans votre liste active.': 'سيظهر {name} مجددًا في قائمتكم النشطة.',
    "{name} n'apparaîtra plus dans votre liste active — son historique est conservé.": 'لن يظهر {name} بعد الآن في قائمتكم النشطة — يُحتفظ بسجله.',

    // --- pages/partner/PartnerClients ---
    'Votre portefeuille privé — visible uniquement par vous et BOGOSLAND.': 'محفظتكم الخاصة — مرئية لكم ولـ BOGOSLAND فقط.',
    'Aucun client archivé': 'لا يوجد زبون مؤرشف',
    'Les clients archivés apparaîtront ici.': 'سيظهر الزبناء المؤرشفون هنا.',
    'Les clients que vous apportez apparaîtront ici.': 'سيظهر هنا الزبناء الذين تجلبونهم.',
    'Ajouté le {date}': 'أُضيف في {date}',
    'Résa.': 'حجز',
    'Voir': 'عرض',
    'Réserver': 'حجز',
    'Il sera ajouté à votre portefeuille, visible uniquement par vous et BOGOSLAND.': 'سيُضاف إلى محفظتكم، مرئيًا لكم ولـ BOGOSLAND فقط.',
    'Email (facultatif)': 'البريد الإلكتروني (اختياري)',

    // --- pages/partner/PartnerCommissions ---
    'Estimées, validées puis payées — le détail de tout ce que BOGOSLAND vous doit.': 'تقديرية، مُصادَق عليها ثم مدفوعة — تفاصيل كل ما يدين لكم به BOGOSLAND.',
    'Estimées': 'تقديرية',
    'Réservations pas encore honorées': 'حجوزات لم تُنجز بعد',
    'Acquises, en attente de paiement': 'مكتسبة، في انتظار الدفع',
    'Payées': 'مدفوعة',
    'Déjà réglées par BOGOSLAND': 'سُددت من BOGOSLAND',
    'Tous les statuts': 'كل الحالات',
    "Vos commissions validées apparaîtront ici dès qu'un de vos clients aura été servi et payé au salon.": 'ستظهر عمولاتكم المُصادَق عليها هنا فور خدمة أحد زبنائكم ودفعه في الصالون.',
    'Taux': 'النسبة',
};

export default missingD;
