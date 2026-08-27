/** Dictionnaire français → arabe (lot employeeA : espace employé — documents, avis, clients, agenda). Clé = chaîne française exacte du code (y compris les libellés sans accents). */
const employeeA: Record<string, string> = {
    // --- pages/employee/EmployeeDocuments ---
    'Mes documents': 'مستنداتي',
    'Documents autorises pour votre compte.': 'المستندات المصرَّح بها لحسابك.',
    'Documents': 'المستندات',
    'Aucun document disponible.': 'لا توجد مستندات متاحة.',

    // --- pages/employee/EmployeeReviews ---
    'Mes avis': 'تقييماتي',
    'Retours clients rattaches a vos prestations.': 'آراء الزبناء المرتبطة بخدماتك.',
    'Avis clients': 'آراء الزبناء',
    "Vous n'avez pas encore recu d'avis.": 'لم تتلقَّ أي تقييم بعد.',
    'Base sur {n} avis': 'بناءً على {n} تقييمًا',

    // --- pages/employee/EmployeeClients ---
    'Mes clients': 'زبنائي',
    'Clients que vous avez reellement servis.': 'الزبناء الذين خدمتهم فعليًا.',
    'Clients servis': 'الزبناء المخدومون',
    'Chargement...': 'جارٍ التحميل...',
    'Aucun client servi pour le moment.': 'لا يوجد زبون مخدوم حتى الآن.',
    'Prestations': 'الخدمات',
    'Derniere visite': 'آخر زيارة',

    // --- pages/employee/EmployeeAgenda ---
    'Mon agenda': 'أجندتي',
    'Uniquement vos rendez-vous affectes.': 'مواعيدك المسندة إليك فقط.',
    'Planning': 'الجدول',
    'Aucun rendez-vous sur cette periode.': 'لا توجد مواعيد في هذه الفترة.',
    'Detail du rendez-vous': 'تفاصيل الموعد',
    'Date': 'التاريخ',
    'Heure': 'الساعة',
    'Duree': 'المدة',
    'Montant': 'المبلغ',
    'Statut': 'الحالة',
    'Origine': 'المصدر',
    'Prestation(s)': 'الخدمة (الخدمات)',
    "Aujourd'hui": 'اليوم',
    'Jour': 'يوم',
    'Semaine': 'أسبوع',
    'Mois': 'شهر',
    'Liste': 'قائمة',
};

export default employeeA;
