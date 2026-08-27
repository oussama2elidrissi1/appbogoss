/** Dictionnaire français → arabe (lot missingA : agenda, formulaire employé, connexion, divers — clés relevées par le rapport de couverture). Clé = chaîne française exacte du code. */
const missingA: Record<string, string> = {
    // --- components/agenda/AgendaCalendar ---
    'Réservation multi-employés': 'حجز متعدد الموظفين',
    'Non assigné': 'غير مسند',
    'Période précédente': 'الفترة السابقة',
    'Période suivante': 'الفترة التالية',

    // --- components/agenda/agendaLocalizer ---
    'Journée': 'اليوم',
    'Semaine travaillée': 'أسبوع العمل',
    'Hier': 'أمس',
    'Demain': 'غدًا',
    'Aucune réservation sur cette période.': 'لا توجد حجوزات في هذه الفترة.',
    '+{n} de plus': '+{n} أخرى',

    // --- components/agenda/ReservationDetailsDialog ---
    'Apportée par le partenaire': 'جلبها الشريك',
    'Commission estimée :': 'العمولة التقديرية :',
    'Créneau alternatif proposé le {date} à {time} — en attente de la réponse du partenaire.': 'موعد بديل مقترح في {date} على الساعة {time} — في انتظار رد الشريك.',
    'Aucun client renseigné.': 'لم يُحدَّد أي زبون.',
    'Sans téléphone': 'بدون هاتف',
    'Personne {n}': 'الشخص {n}',
    '(contact)': '(جهة الاتصال)',
    'Aucune prestation.': 'لا توجد خدمات.',
    'Durée estimée': 'المدة التقديرية',
    'Modifier avant acceptation': 'تعديل قبل القبول',
    'Proposer un autre créneau': 'اقتراح موعد آخر',
    'Refuser cette réservation ?': 'رفض هذا الحجز؟',
    'Le partenaire verra le motif choisi sur sa fiche de réservation.': 'سيرى الشريك السبب المختار في بطاقة حجزه.',
    "Le partenaire recevra cette proposition et pourra l'accepter ou la refuser.": 'سيتلقى الشريك هذا الاقتراح ويمكنه قبوله أو رفضه.',
    'Envoyer la proposition': 'إرسال الاقتراح',
    'Note (facultatif)': 'ملاحظة (اختياري)',
    'Ex. créneau du matin complet': 'مثال: فترة الصباح ممتلئة',

    // --- components/agenda/ReservationDialog ---
    'Modifier la réservation': 'تعديل الحجز',
    'Renseignez le client titulaire (ses coordonnées suffisent pour tout le groupe), ajoutez les personnes, puis les prestations de chacune.':
        'أدخل الزبون صاحب الحجز (تكفي بياناته لكامل المجموعة)، أضف الأشخاص، ثم خدمات كل واحد منهم.',
    'Client titulaire (coordonnées)': 'الزبون صاحب الحجز (بيانات الاتصال)',
    'Rechercher ou saisir un nom...': 'البحث أو إدخال اسم...',
    'Personnes ({n})': 'الأشخاص ({n})',
    'Nom de la personne {n} (facultatif)': 'اسم الشخص {n} (اختياري)',
    'Prestations — pour qui ?': 'الخدمات — لمن؟',
    'Les prestations ajoutées ci-dessous seront affectées à': 'ستُسند الخدمات المضافة أدناه إلى',
    'Rechercher une prestation {category}...': 'البحث عن خدمة {category}...',
    'Récapitulatif par personne': 'ملخص لكل شخص',
    'Récapitulatif & employé (facultatif)': 'الملخص والموظف (اختياري)',
    'Sélectionnez une ou plusieurs prestations ci-dessus.': 'اختر خدمة أو أكثر أعلاه.',
    "n'a pas encore de prestation.": 'ليس لديه أي خدمة بعد.',
    'Date et heure': 'التاريخ والساعة',
    'Votre réservation sera envoyée « En attente » — le salon la confirmera.': 'سيُرسل حجزكم بحالة « في الانتظار » — وسيؤكده الصالون.',
    'Préférence, remarque, acompte...': 'تفضيل، ملاحظة، عربون...',
    'durée estimée {n} min': 'المدة التقديرية {n} دقيقة',
    'Créer la réservation': 'إنشاء الحجز',
    'Supprimer cette réservation ?': 'حذف هذا الحجز؟',
    'La réservation de {name} sera définitivement supprimée.': 'سيتم حذف حجز {name} نهائيًا.',
    'ce client': 'هذا الزبون',

    // --- components/agenda/ReservationList ---
    'Aucune réservation avec ce statut sur cette période.': 'لا توجد حجوزات بهذه الحالة في هذه الفترة.',

    // --- components/pos2/Pos2InvoiceDetailDrawer ---
    'Ticket supprimé - non calculé dans le CA ni les commissions.': 'تذكرة محذوفة - غير محتسبة في رقم المعاملات ولا في العمولات.',
    '+ {x} de pourboires — inclus dans le total encaissé ; coiffure commissionnée à 50%.': '+ {x} إكراميات — مشمولة في المجموع المُحصَّل؛ عمولة الحلاقة 50%.',

    // --- components/workday/DayLedger ---
    'impr.': 'طبعة',

    // --- components/workday/EmployeeFormDialog ---
    'Tous les services des catégories ci-dessus': 'جميع خدمات الفئات أعلاه',
    'Le nom et le poste sont obligatoires.': 'الاسم والمنصب إلزاميان.',
    'Renseignez les informations utilisées dans la caisse, les commissions et les rapports.': 'أدخل المعلومات المستخدمة في الصندوق والعمولات والتقارير.',
    'Amelie Rousseau': 'أميلي روسو',
    'Poste': 'المنصب',
    'Coiffeur': 'حلاق',
    'Commission par défaut (%)': 'العمولة الافتراضية (%)',
    'Spécialités': 'التخصصات',
    'Coupe, Barbe, Coloration': 'قص، لحية، صبغة',
    'Catégories de services': 'فئات الخدمات',
    'Détermine ce que l’employé voit dans « Nouvelle prestation » sur son espace. Aucune sélection = toutes les catégories.':
        'يحدد ما يراه الموظف في « خدمة جديدة » في فضائه. لا اختيار = كل الفئات.',
    'Services autorisés': 'الخدمات المسموح بها',
    'Restreint « Nouvelle prestation » à exactement ces services — plus précis que les catégories ci-dessus. Aucune sélection = tous les services des catégories autorisées.':
        'يحصر « خدمة جديدة » في هذه الخدمات بالضبط — أدق من الفئات أعلاه. لا اختيار = كل خدمات الفئات المسموح بها.',
    'Permet à l’employé de se connecter avec son propre compte.': 'يتيح للموظف تسجيل الدخول بحسابه الخاص.',
    '(laisser vide pour ne pas changer)': '(اتركه فارغًا لعدم التغيير)',
    '8 caractères minimum': '8 أحرف على الأقل',
    'Rôle système': 'دور النظام',
    'Employé — accède uniquement à son propre espace': 'موظف — يصل إلى فضائه الخاص فقط',
    'Administrateur/Caissier — accès de gestion complet': 'مدير/أمين صندوق — صلاحيات إدارة كاملة',
    'Couleur': 'اللون',
    'Couleur {x}': 'اللون {x}',
    'Nouveau mot de passe :': 'كلمة المرور الجديدة :',
    'Communiquez-le à l’employé — il ne sera plus affiché ensuite.': 'أبلغه للموظف — لن يُعرض مرة أخرى بعد ذلك.',

    // --- lib/i18n ---
    'Page {n}': 'الصفحة {n}',

    // --- pages/Login ---
    'En direct': 'مباشر',
    "Rendez-vous aujourd'hui": 'مواعيد اليوم',
    'Performance équipe': 'أداء الفريق',
    'Services populaires': 'الخدمات الرائجة',

    // --- pages/PlaceholderPage ---
    'Bientôt disponible': 'متاح قريبًا',
    'Retour au dashboard': 'العودة إلى لوحة التحكم',

    // --- pages/pos2/PosV2History ---
    'Ventes': 'المبيعات',
    'Société': 'الشركة',

    // --- pages/Agenda ---
    'Vos réservations partenaires — créez une réservation, le salon la confirme.': 'حجوزاتكم كشريك — أنشئوا حجزًا وسيؤكده الصالون.',
    'Planning professionnel du salon — glissez-déposez pour reprogrammer, redimensionnez pour ajuster la durée.':
        'الجدول المهني للصالون — اسحب وأفلت لإعادة البرمجة، وغيّر الحجم لضبط المدة.',
};

export default missingA;
