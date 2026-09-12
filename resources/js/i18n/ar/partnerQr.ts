/**
 * QR partenaire, packs et vitrine — français → arabe.
 *
 * Le dictionnaire est partagé avec l'application mobile (export JSON dans ses
 * assets) : toute chaîne ajoutée ici doit y être ré-exportée.
 *
 * La page publique /p/{token} n'y figure pas : elle est destinée au client
 * final qui scanne l'affiche et reste en français, comme la vitrine.
 */
const partnerQr: Record<string, string> = {
    // ------------------------------------------------------------ Navigation
    Packs: 'الباقات',
    'Assemblages de prestations proposes aux partenaires sur leur page QR.':
        'مجموعات من الخدمات تُقترح على الشركاء في صفحة رمز QR الخاصة بهم.',
    'Assemblages de prestations du catalogue, proposés aux partenaires sur leur page QR.':
        'مجموعات من خدمات الكتالوج، تُقترح على الشركاء في صفحة رمز QR الخاصة بهم.',
    'Ma vitrine': 'واجهتي',
    'Mon QR Code': 'رمز QR الخاص بي',
    'QR & Offres': 'رمز QR والعروض',

    // ------------------------------------------------------------------- QR
    'QR Code partenaire': 'رمز QR للشريك',
    'Aucun QR actif': 'لا يوجد رمز QR نشط',
    'L’affiche est la même pour tous les partenaires — seul ce QR change. Il n’expose jamais l’identifiant du partenaire.':
        'الملصق نفسه لجميع الشركاء — وحده رمز QR يتغيّر. ولا يكشف أبداً معرّف الشريك.',
    Copier: 'نسخ',
    Copié: 'تم النسخ',
    'Le lien n’a pas pu être copié.': 'تعذّر نسخ الرابط.',
    'Télécharger l’affiche partenaire': 'تحميل ملصق الشريك',
    'Télécharger l’affiche': 'تحميل الملصق',
    'QR seul (PNG)': 'رمز QR وحده (PNG)',
    'L’affiche n’a pas pu être générée.': 'تعذّر إنشاء الملصق.',
    'Aperçu de la page': 'معاينة الصفحة',
    'Voir ma page': 'عرض صفحتي',
    Révoquer: 'إبطال',
    'Régénérer le QR ?': 'إعادة توليد رمز QR؟',
    'Les affiches déjà imprimées cesseront d’attribuer les réservations. Les réservations passées ne changent pas.':
        'الملصقات المطبوعة سابقاً لن تُنسب إليها أي حجوزات بعد الآن. الحجوزات السابقة لا تتغيّر.',
    'Révoquer le QR ?': 'إبطال رمز QR؟',
    'La page publique de ce partenaire devient inaccessible et plus aucune réservation ne lui sera attribuée.':
        'تصبح الصفحة العامة لهذا الشريك غير متاحة ولن يُنسب إليه أي حجز بعد الآن.',
    'Affichez-le chez vous : chaque réservation issue d’un scan vous est attribuée.':
        'اعرضه لدى محلّكم: كل حجز ناتج عن مسح يُنسب إليكم.',
    'Votre page n’est pas publiée actuellement. Contactez le salon.':
        'صفحتكم غير منشورة حالياً. يُرجى الاتصال بالصالون.',

    // -------------------------------------------------------------- Vitrine
    'Offres QR': 'عروض رمز QR',
    'Ce que ce partenaire affiche après le scan. Les autres partenaires ne changent pas.':
        'ما يعرضه هذا الشريك بعد المسح. الشركاء الآخرون لا يتغيّرون.',
    'Aucune offre : la page de ce partenaire sera vide.': 'لا يوجد أي عرض: ستكون صفحة هذا الشريك فارغة.',
    Personnaliser: 'تخصيص',
    'Mettre en avant': 'إبراز',
    Monter: 'رفع',
    Descendre: 'خفض',
    'Titre affiché': 'العنوان المعروض',
    'Description affichée': 'الوصف المعروض',
    'Prix spécifique': 'سعر خاص',
    'Commission spécifique': 'عمولة خاصة',
    'Visible à partir du': 'ظاهر ابتداءً من',
    'Visible jusqu’au': 'ظاهر حتى',

    // ----------------------------------------------------------- Page QR
    'Page QR': 'صفحة رمز QR',
    Titre: 'العنوان',
    'Sous-titre': 'العنوان الفرعي',
    'Texte d’accueil': 'نص الترحيب',
    'Image de couverture (URL)': 'صورة الغلاف (رابط)',
    'Prenez soin de vous.': 'اعتنوا بأنفسكم.',

    // ---------------------------------------------------------- Statistiques
    'Visites QR': 'زيارات رمز QR',
    Conversion: 'نسبة التحويل',
    'Réservations issues du QR': 'الحجوزات الناتجة عن رمز QR',
    'Réservations issues de mon QR': 'الحجوزات الناتجة عن رمز QR الخاص بي',
    'Aucune réservation issue de ce QR pour le moment.': 'لا يوجد أي حجز ناتج عن رمز QR هذا حالياً.',
    'Aucune réservation issue de votre QR pour le moment.': 'لا يوجد أي حجز ناتج عن رمز QR الخاص بكم حالياً.',

    // ---------------------------------------------------------------- Packs
    Pack: 'باقة',
    'Nouveau pack': 'باقة جديدة',
    'Modifier le pack': 'تعديل الباقة',
    'Pack Premium': 'الباقة المميّزة',
    'Prestations incluses': 'الخدمات المشمولة',
    'Prix promotionnel': 'السعر الترويجي',
    'Valeur au catalogue : {amount}': 'القيمة في الكتالوج: {amount}',
    'Aucun pack pour l’instant. Créez-en un pour le proposer à vos partenaires.':
        'لا توجد باقات حالياً. أنشئوا واحدة لاقتراحها على شركائكم.',
    'Supprimer ce pack ?': 'حذف هذه الباقة؟',
    'Un pack déjà proposé à un partenaire est archivé plutôt que supprimé, pour ne pas effacer l’historique.':
        'الباقة المقترحة على شريك تُؤرشف بدل حذفها، حفاظاً على السجلّ.',
};

export default partnerQr;
