/**
 * Vitrine publique mobile + traçabilité de la source des réservations (web).
 *
 * Mêmes clés françaises que le code — le mobile consomme ce dictionnaire via
 * l'export assets/i18n/ar.json (voir la commande esbuild du README i18n).
 */
const publicBooking: Record<string, string> = {
    // --- Source des réservations (web : badge, filtre, détail)
    'App mobile': 'تطبيق الهاتف',
    'Mobile public': 'تطبيق الهاتف العمومي',
    'Application mobile Bogosland': 'تطبيق بوغوسلاند للهاتف',
    'Toutes sources': 'كل المصادر',
    'Origine de la réservation': 'مصدر الحجز',
    'Source :': 'المصدر:',
    'Créée le {date} à {time}': 'أُنشئ في {date} على الساعة {time}',
    'Agenda BOGOSLAND': 'مفكرة بوغوسلاند',
    'Portail partenaire': 'بوابة الشريك',
    'Caisse': 'الصندوق',

    // --- Accueil public
    'Prenez le temps\nd’être impeccable.': 'خذ وقتك\nلتكون في كامل أناقتك.',
    'Coiffure, barbe, hammam et soins. Choisissez votre prestation, votre horaire — le salon s’occupe du reste.':
        'حلاقة، لحية، حمّام وعناية. اختر خدمتك وموعدك — والصالون يتكفل بالباقي.',
    'Réserver': 'احجز',
    'Voir les services': 'تصفح الخدمات',
    'Espace employé': 'فضاء الموظف',
    'Nos univers': 'عوالمنا',
    'Prestations phares': 'أبرز الخدمات',
    'Tout le catalogue': 'كل الخدمات',
    'La maison': 'الدار',
    'Tous les jours': 'كل أيام الأسبوع',
    'Accueil public': 'الواجهة العمومية',

    // --- Catalogue
    'Nos services': 'خدماتنا',
    'Rechercher une prestation': 'ابحث عن خدمة',
    'Le catalogue arrive bientôt.': 'قائمة الخدمات قادمة قريبا.',
    'Aucune prestation ne correspond à votre recherche.': 'لا توجد خدمة تطابق بحثك.',
    '{count} prestation(s)': '{count} خدمة',
    'Tout': 'الكل',

    // --- Fiche prestation
    'Prestation': 'الخدمة',
    'Durée': 'المدة',
    'Réalisée par': 'يقوم بها',
    'L’équipe vous sera proposée au moment de la réservation.': 'سيُقترح عليك الفريق عند الحجز.',
    'Bon à savoir': 'معلومات مفيدة',
    'Présentez-vous quelques minutes avant votre créneau.': 'يُرجى الحضور قبل موعدك ببضع دقائق.',
    'Le règlement se fait sur place, au salon.': 'الدفع يتم في عين المكان، بالصالون.',
    'Besoin de déplacer votre venue ? Appelez simplement le salon.': 'تريد تغيير موعدك؟ اتصل بالصالون فقط.',
    'Réserver maintenant': 'احجز الآن',

    // --- Parcours de réservation
    'La prestation': 'الخدمة',
    'Le jour': 'اليوم',
    'L’heure': 'الساعة',
    'Avec qui ?': 'مع من؟',
    'Vos coordonnées': 'معلوماتك',
    'Votre nom': 'اسمك',
    'facultatif': 'اختياري',
    'Note pour le salon': 'ملاحظة للصالون',
    'Récapitulatif': 'الملخص',
    'Changer': 'تغيير',
    'Sans préférence': 'دون تفضيل',
    'Confirmer la réservation': 'تأكيد الحجز',
    'Le salon confirme chaque demande — vous serez contacté au numéro indiqué.':
        'الصالون يؤكد كل طلب — سيتم الاتصال بك على الرقم المذكور.',
    'Aucun créneau réservable ce jour-là — choisissez un autre jour.':
        'لا توجد مواعيد متاحة في هذا اليوم — اختر يوما آخر.',
    'Journée complète — choisissez un autre jour.': 'اليوم ممتلئ — اختر يوما آخر.',
    'Lun': 'الإثنين',
    'Mar': 'الثلاثاء',
    'Mer': 'الأربعاء',
    'Jeu': 'الخميس',
    'Ven': 'الجمعة',
    'Sam': 'السبت',
    'Dim': 'الأحد',

    // --- Confirmation
    'Demande envoyée': 'تم إرسال الطلب',
    'Le salon vous confirmera votre rendez-vous au {phone}.': 'سيؤكد لك الصالون موعدك على الرقم {phone}.',
    'Retour à l’accueil': 'العودة إلى الاستقبال',
    'Cette page a expiré.': 'انتهت صلاحية هذه الصفحة.',
    'Avec': 'مع',

    // --- États réseau
    'Impossible de joindre le salon pour le moment.': 'تعذر الاتصال بالصالون حاليا.',
};

export default publicBooking;
