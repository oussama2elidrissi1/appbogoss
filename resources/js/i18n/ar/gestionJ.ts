/** Dictionnaire français → arabe (lot gestionJ : dépenses). Clé = chaîne française exacte du code. */
const gestionJ: Record<string, string> = {
    // --- pages/Depenses ---
    'Achats': 'مشتريات',
    'Réparations': 'إصلاحات',
    'Boissons': 'مشروبات',
    'Divers': 'متنوعات',
    'Indiquez un libellé.': 'أدخل تسمية.',
    'Libellé trop long.': 'التسمية طويلة جدًا.',
    'Choisissez une catégorie.': 'اختر فئة.',
    'Le montant doit être supérieur à 0.': 'يجب أن يكون المبلغ أكبر من 0.',
    'Indiquez une date.': 'أدخل تاريخًا.',
    'Aucune journée ouverte': 'لا توجد يومية مفتوحة',
    'Ouvrez la journée dans Caisse pour enregistrer des dépenses.': 'افتح اليومية في الصندوق لتسجيل المصاريف.',
    'Aller à la caisse': 'الذهاب إلى الصندوق',
    'Déplacer vers une autre journée de caisse': 'نقل إلى يومية صندوق أخرى',
    'Convertir en avance sur salaire': 'تحويل إلى سلفة على الأجر',
    'Supprimer cette dépense': 'حذف هذا المصروف',
    'Rattacher cette dépense à la journée de caisse du :': 'ربط هذا المصروف بيومية الصندوق بتاريخ :',
    'Choisir une journée…': 'اختر يومية…',
    'Déplacer': 'نقل',
    'En réalité une avance sur salaire pour :': 'في الواقع سلفة على الأجر لـ :',
    'Choisir un employé…': 'اختر موظفًا…',
    'Convertir': 'تحويل',
    'Dépenses du jour': 'مصاريف اليوم',
    'Chaque sortie de caisse est rattachée à la journée en cours et déduite du résultat net.': 'كل مبلغ يخرج من الصندوق يُربط باليومية الجارية ويُخصم من النتيجة الصافية.',
    'Nouvelle dépense': 'مصروف جديد',
    'Libellé, catégorie et montant — trois champs, c’est tout.': 'التسمية، الفئة والمبلغ — ثلاثة حقول فقط.',
    'Ex. Serviettes, recharge gaz…': 'مثال: مناشف، تعبئة غاز…',
    'Pour une dépense d’une journée déjà clôturée — sinon elle est automatiquement rattachée à la journée en cours, quelle que soit la date choisie ci-dessus.':
        'لمصروف يخص يومية مغلقة مسبقًا — وإلا فسيُربط تلقائيًا باليومية الجارية أيًّا كان التاريخ المختار أعلاه.',
    'Enregistrer la dépense': 'حفظ المصروف',
    'Dépenses enregistrées': 'المصاريف المسجلة',
    'Total cumulé sur la journée en cours': 'المجموع التراكمي لليومية الجارية',
    'Aucune dépense': 'لا توجد مصاريف',
    'Les sorties de caisse de la journée apparaîtront ici.': 'ستظهر هنا المبالغ الخارجة من الصندوق خلال اليومية.',
    'Historique des dépenses': 'سجل المصاريف',
    'Toutes les dépenses de la période, quelle que soit leur journée de caisse — de quoi retrouver et corriger une dépense passée.':
        'جميع مصاريف الفترة أيًّا كانت يومية صندوقها — لاسترجاع مصروف سابق وتصحيحه.',
    'Aucune dépense sur cette période': 'لا توجد مصاريف في هذه الفترة',
    'Élargissez la période pour retrouver une dépense passée.': 'وسّع الفترة لاسترجاع مصروف سابق.',
    'Supprimer cette dépense ?': 'حذف هذا المصروف؟',
    '« {label} » (−{amount}) sera définitivement supprimée — le résultat de sa journée de caisse sera recalculé sans elle.':
        'سيتم حذف « {label} » (−{amount}) نهائيًا — وستُعاد حساب نتيجة يومية صندوقه بدونه.',
};

export default gestionJ;
