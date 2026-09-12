/**
 * Caisse de test — français → arabe.
 *
 * L'écran vit entièrement dans le navigateur, mais il parle la même langue
 * que le reste de l'application : le dictionnaire est partagé avec le mobile
 * (exporté en JSON dans ses assets), donc une chaîne ajoutée ici doit y être
 * ré-exportée.
 */
const caisseTest: Record<string, string> = {
    // ------------------------------------------------------------ Navigation
    'Caisse de test': 'صندوق الاختبار',
    'La caisse complète pour essayer : journée, factures, encaissement et clôture, sans rien écrire en base.':
        'الصندوق الكامل للتجربة: اليوم، الفواتير، التحصيل والإقفال، دون أي كتابة في قاعدة البيانات.',

    // ---------------------------------------------------------------- Entête
    'Aucune écriture en base': 'لا كتابة في قاعدة البيانات',
    'Le parcours complet de la caisse, en mémoire : tout disparaît à la fermeture de l’onglet.':
        'مسار الصندوق كاملاً، في الذاكرة: كل شيء يختفي عند إغلاق التبويب.',
    '{count} en service · fond de caisse {amount} · ouverte à {time}':
        '{count} في الخدمة · رصيد افتتاحي {amount} · فُتح على الساعة {time}',
    TEST: 'اختبار',

    // --------------------------------------------------------- Ouverture
    'Ouvrir une journée de test': 'فتح يوم اختبار',
    'Ouvrir la journée de test': 'فتح يوم الاختبار',
    'Nouvelle journée de test': 'يوم اختبار جديد',
    'Employés en service': 'الموظفون في الخدمة',
    'Rien de ce qui suit ne quitte le navigateur : ni journée, ni ticket, ni commission, ni mouvement de stock.':
        'لا شيء مما يلي يغادر المتصفّح: لا يوم، ولا تذكرة، ولا عمولة، ولا حركة مخزون.',

    // ----------------------------------------------------------- Encaissement
    'CA de test': 'رقم معاملات الاختبار',
    'Aucune facture en cours.': 'لا توجد فاتورة جارية.',
    'Tickets encaissés (test)': 'التذاكر المحصّلة (اختبار)',
    Comptoir: 'الكاونتر',
    'Total encaissé': 'المجموع المحصَّل',

    // ---------------------------------------------------- Dépense et avance
    'Dépense de test': 'مصروف اختباري',
    'Avance de test': 'سلفة اختبارية',

    // --------------------------------------------------------------- Clôture
    'Clôturer la journée de test': 'إقفال يوم الاختبار',
    'Journée de test clôturée à {time}': 'أُقفل يوم الاختبار على الساعة {time}',
    'Attendu en tiroir': 'المتوقع في الصندوق',
    'Attendu en tiroir : {amount}': 'المتوقع في الصندوق: {amount}',
    'Compté en tiroir (optionnel)': 'المحسوب في الصندوق (اختياري)',
    'Tiroir juste': 'الصندوق مطابق',
    'Écart {amount}': 'فرق {amount}',
    '{n} facture(s) encore ouverte(s) : elles seront abandonnées, elles n’ont jamais été encaissées.':
        '{n} فاتورة ما زالت مفتوحة: ستُهمَل، فهي لم تُحصَّل قط.',

    'dont {amount} de pourboires': 'منها {amount} بقشيش',

    // ----------------------------------------------------------- Commissions
    'commission {amount}': 'عمولة {amount}',
    'Commissions du ticket': 'عمولات التذكرة',
    '+ {amount} en cours': '+ {amount} جارية',
    '{count} ligne(s) · commission {amount}': '{count} سطر · عمولة {amount}',
    'Commissions calculées avec les règles réelles du salon — règle par service si elle existe, sinon taux par défaut de l’employé. Rien n’en est enregistré.':
        'العمولات محسوبة بقواعد الصالون الحقيقية — قاعدة الخدمة إن وُجدت، وإلا النسبة الافتراضية للموظف. ولا يُسجَّل منها شيء.',

    // --------------------------------------------------------------- Rapport
    'Avances détaillées': 'تفاصيل السلف',
    'Aucune dépense sur cette journée de test.': 'لا توجد مصاريف في يوم الاختبار هذا.',
    'Aucune avance sur cette journée de test.': 'لا توجد سلفة في يوم الاختبار هذا.',
    'Rien à afficher.': 'لا شيء لعرضه.',
};

export default caisseTest;
