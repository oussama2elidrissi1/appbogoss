/** Dictionnaire français → arabe (lot portailsA). Clé = chaîne française exacte du code. */
const portailsA: Record<string, string> = {
    // ---------------------------------------------------------------
    // pages/Partenaires.tsx
    // ---------------------------------------------------------------
    'Partenaires': 'الشركاء',
    'Hôtels, riads, guides… qui réservent pour leurs clients. Chaque partenaire a son compte de connexion et sa commission par service (fixe ou pourcentage).':
        'فنادق ورياضات ومرشدون… يحجزون لزبنائهم. لكل شريك حساب دخول خاص به وعمولة لكل خدمة (ثابتة أو بنسبة مئوية).',
    'Nouveau partenaire': 'شريك جديد',
    'Rechercher un partenaire...': 'البحث عن شريك...',
    'Réessayer': 'إعادة المحاولة',
    'Aucun partenaire': 'لا يوجد شركاء',
    'Créez un compte partenaire pour lui permettre de réserver dans votre agenda.':
        'أنشئ حساب شريك لتمكينه من الحجز في جدول مواعيدك.',
    'Aucune coordonnée': 'لا توجد بيانات اتصال',
    '{n} réservations': '{n} حجوزات',
    '{n} réservation': '{n} حجز',
    '{n} commissions': '{n} عمولات',
    '{n} commission': '{n} عمولة',
    // Statuts partenaire (STATUS_META — traduits au rendu)
    'En attente': 'قيد الانتظار',
    'Actif': 'نشط',
    'Suspendu': 'معلّق',
    'Désactivé': 'معطّل',
    'Voir la fiche': 'عرض البطاقة',
    'Modifier le partenaire': 'تعديل الشريك',
    'Réinitialiser le mot de passe': 'إعادة تعيين كلمة المرور',
    'Supprimer le partenaire': 'حذف الشريك',
    'Service {id}': 'الخدمة {id}',
    'Supprimer ce partenaire ?': 'حذف هذا الشريك؟',
    "{name}, son compte de connexion et sa grille de commissions seront définitivement supprimés. Ses réservations existantes restent dans l'agenda.":
        'سيتم حذف {name} وحساب الدخول الخاص به وجدول عمولاته نهائيًا. تبقى حجوزاته الحالية في جدول المواعيد.',
    'Supprimer': 'حذف',
    'Réinitialiser le mot de passe ?': 'إعادة تعيين كلمة المرور؟',
    "Un nouveau mot de passe sera généré pour {name}. L'ancien ne fonctionnera plus.":
        'سيتم إنشاء كلمة مرور جديدة لـ {name}. ولن تعمل كلمة المرور القديمة بعد الآن.',
    'Réinitialiser': 'إعادة تعيين',

    // ---------------------------------------------------------------
    // pages/PartnerDetail.tsx
    // ---------------------------------------------------------------
    'Partenaire introuvable.': 'الشريك غير موجود.',
    'Retour aux partenaires': 'العودة إلى الشركاء',
    'Retour': 'رجوع',
    'Fiche partenaire': 'بطاقة الشريك',
    'aucun compte': 'لا يوجد حساب',
    'Clients apportés': 'الزبناء المُحالون',
    'Réservations': 'الحجوزات',
    'Réservations confirmées': 'الحجوزات المؤكدة',
    'CA généré': 'رقم المعاملات المحقق',
    'Commission à payer': 'العمولة المستحقة الدفع',
    'Informations': 'المعلومات',
    'Clients': 'الزبناء',
    'Commissions': 'العمولات',
    'Entreprise': 'الشركة',
    'Nom commercial': 'الاسم التجاري',
    'Raison sociale': 'الاسم القانوني',
    'ICE': 'رقم ICE',
    'Adresse': 'العنوان',
    'Compte': 'الحساب',
    'Email de connexion': 'البريد الإلكتروني لتسجيل الدخول',
    'Statut': 'الحالة',
    'Inscrit le': 'تاريخ التسجيل',
    'Informations de paiement': 'معلومات الدفع',
    'Titulaire': 'صاحب الحساب',
    'Banque': 'البنك',
    'RIB / IBAN': 'الحساب البنكي (RIB / IBAN)',
    'Méthode préférée': 'الطريقة المفضلة',
    'Aucun client apporté.': 'لا يوجد زبناء مُحالون.',
    'Aucune réservation.': 'لا توجد حجوزات.',
    'Aucune commission validée en attente de paiement.': 'لا توجد عمولات مصادق عليها في انتظار الدفع.',

    // ---------------------------------------------------------------
    // pages/PartnerCommissionsAdmin.tsx
    // ---------------------------------------------------------------
    'Commissions partenaires': 'عمولات الشركاء',
    'Commissions validées, en attente de règlement — sélectionnez celles à payer.':
        'العمولات المصادق عليها في انتظار التسوية — حدّد العمولات المراد دفعها.',
    'Total dû': 'إجمالي المستحق',
    'Tous les partenaires': 'جميع الشركاء',
    'Marquer comme payé': 'تحديد كمدفوع',
    'Rien à payer': 'لا شيء مستحق للدفع',
    'Aucune commission validée en attente.': 'لا توجد عمولات مصادق عليها قيد الانتظار.',
    'Partenaire': 'الشريك',
    'Client': 'الزبون',
    'Service': 'الخدمة',
    'Date': 'التاريخ',
    'Commission': 'العمولة',
    'Marquer ces commissions comme payées ?': 'تعليم هذه العمولات كمدفوعة؟',
    '{amount} seront enregistrés comme payés ({n} commissions).': 'سيتم تسجيل {amount} كمبلغ مدفوع ({n} عمولات).',
    '{amount} seront enregistrés comme payés ({n} commission).': 'سيتم تسجيل {amount} كمبلغ مدفوع ({n} عمولة).',
    'Confirmer le paiement': 'تأكيد الدفع',
    'Mode de paiement': 'طريقة الدفع',
    'Virement': 'تحويل بنكي',
    'Chèque': 'شيك',
    'Espèces': 'نقدًا',
    'Autre': 'أخرى',
    'Référence': 'المرجع',
    'N° de virement...': 'رقم التحويل...',
    'Notes': 'ملاحظات',

    // ---------------------------------------------------------------
    // pages/PartnerReservationsReview.tsx
    // ---------------------------------------------------------------
    'Réservations partenaires': 'حجوزات الشركاء',
    "Demandes en attente d'une décision — accepter, proposer un autre créneau ou refuser.":
        'طلبات في انتظار القرار — قبول أو اقتراح موعد آخر أو رفض.',
    'Aucune demande en attente': 'لا توجد طلبات قيد الانتظار',
    'Toutes les réservations partenaires ont été traitées.': 'تمت معالجة جميع حجوزات الشركاء.',
    'Contact': 'جهة الاتصال',
    'Participants': 'المشاركون',
    'Total': 'المجموع',
    '{n} participants': '{n} مشاركين',
    '{n} participant': '{n} مشارك',

    // ---------------------------------------------------------------
    // pages/SupportInbox.tsx
    // ---------------------------------------------------------------
    'Support': 'الدعم',
    'Conversations avec les partenaires.': 'المحادثات مع الشركاء.',
    // Statuts / filtres (STATUS_META, STATUS_FILTERS — traduits au rendu)
    'Toutes': 'الكل',
    'Nouveau': 'جديد',
    'En cours': 'جارٍ',
    'En attente partenaire': 'في انتظار الشريك',
    'Résolu': 'تم الحل',
    'Fermé': 'مغلق',
    'Aucune conversation': 'لا توجد محادثات',
    'Rien à traiter pour le moment.': 'لا شيء للمعالجة في الوقت الحالي.',
    'Sans sujet': 'بدون موضوع',
    'Conversation': 'محادثة',
    'Aucun message': 'لا توجد رسائل',
    "Répondez pour démarrer l'échange.": 'ردّ لبدء المحادثة.',
    'Écrire un message...': 'اكتب رسالة...',
    'Envoyer': 'إرسال',

    // ---------------------------------------------------------------
    // components/layout/NotificationsBell.tsx
    // ---------------------------------------------------------------
    'Notifications': 'الإشعارات',
    'Tout marquer lu': 'تعليم الكل كمقروء',
    'Aucune notification pour le moment.': 'لا توجد إشعارات في الوقت الحالي.',

    // ---------------------------------------------------------------
    // components/ProtectedRoute.tsx
    // ---------------------------------------------------------------
    'Chargement de votre espace…': 'جارٍ تحميل فضائك…',
};

export default portailsA;
