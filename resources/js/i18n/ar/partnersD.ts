/** Dictionnaire français → arabe (lot partnersD : portail partenaire — nouvelle réservation en 5 étapes). Clé = chaîne française exacte du code. */
const partnersD: Record<string, string> = {
    // --- pages/partner/PartnerNewReservation ---
    'Participants': 'المشاركون',
    'Créneau': 'الموعد',
    'Récapitulatif': 'الملخص',
    'Réservez pour vos clients en quelques clics — plusieurs personnes, plusieurs prestations.': 'احجزوا لزبنائكم ببضع نقرات — عدة أشخاص، عدة خدمات.',
    'Précédent': 'السابق',
    'Suivant': 'التالي',
    'Confirmer la réservation': 'تأكيد الحجز',
    'Étape 1 — Client': 'الخطوة 1 — الزبون',
    'Choisissez le contact principal dans votre portefeuille, ou ajoutez-en un nouveau. Ses coordonnées serviront pour tout le groupe.':
        'اختاروا جهة الاتصال الرئيسية من محفظتكم، أو أضيفوا واحدة جديدة. ستُستخدم بياناتها لكامل المجموعة.',
    'Rechercher parmi vos clients...': 'البحث بين زبنائكم...',
    'Aucun téléphone': 'لا يوجد هاتف',
    'Aucun client ne correspond dans votre portefeuille.': 'لا يوجد زبون مطابق في محفظتكم.',
    'Ajouter ce client': 'إضافة هذا الزبون',
    'Étape 2 — Participants': 'الخطوة 2 — المشاركون',
    "Une réservation peut concerner plusieurs personnes — ajoutez-les ici. Elles n'ont pas besoin d'être des clients enregistrés, un simple prénom suffit.":
        'يمكن أن يشمل الحجز عدة أشخاص — أضيفوهم هنا. لا يلزم أن يكونوا زبناء مسجلين، يكفي الاسم الشخصي.',
    'Client titulaire': 'الزبون صاحب الحجز',
    'Contact principal': 'جهة الاتصال الرئيسية',
    'Prénom de la personne {n} (facultatif)': 'الاسم الشخصي للشخص {n} (اختياري)',
    'Retirer cette personne': 'إزالة هذا الشخص',
    'Ajouter une personne': 'إضافة شخص',
    'Étape 3 — Prestations par personne': 'الخطوة 3 — الخدمات لكل شخص',
    'Uniquement les prestations que BOGOSLAND vous autorise à réserver.': 'فقط الخدمات التي يسمح لكم BOGOSLAND بحجزها.',
    'Aucune offre ne vous a encore été attribuée — contactez BOGOSLAND.': 'لم يُسند إليكم أي عرض بعد — تواصلوا مع BOGOSLAND.',
    'Prestations de {name}': 'خدمات {name}',
    'Appliquer à tous': 'تطبيق على الجميع',
    'Aucune prestation sélectionnée.': 'لم يتم اختيار أي خدمة.',
    'Retirer cette prestation': 'إزالة هذه الخدمة',
    'Sous-total': 'المجموع الفرعي',
    'Étape 4 — Date & créneau': 'الخطوة 4 — التاريخ والموعد',
    'Quand votre client sera-t-il attendu au salon ?': 'متى سيكون زبونكم منتظرًا في الصالون؟',
    'Suggestions': 'اقتراحات',
    'Ce créneau est indicatif — BOGOSLAND confirmera la disponibilité réelle au traitement de votre demande, et peut vous proposer un autre horaire si besoin.':
        'هذا الموعد إرشادي — سيؤكد BOGOSLAND التوفر الفعلي عند معالجة طلبكم، وقد يقترح عليكم موعدًا آخر عند الحاجة.',
    'Étape 5 — Récapitulatif': 'الخطوة 5 — الملخص',
    'Vérifiez les informations avant de confirmer.': 'تحققوا من المعلومات قبل التأكيد.',
    '{n} participant': '{n} مشارك',
    '{n} participants': '{n} مشاركين',
    'La réservation sera envoyée à BOGOSLAND pour confirmation — une référence unique lui sera attribuée dès sa création.':
        'سيُرسل الحجز إلى BOGOSLAND للتأكيد — وسيُمنح مرجعًا فريدًا فور إنشائه.',
};

export default partnersD;
