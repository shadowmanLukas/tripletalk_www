export type LandingLanguage = "pl" | "en";

export const landingSeo = {
  pl: {
    title: "Fiszki AI do nauki słówek z własnych materiałów | TripleTalk",
    description:
      "Zrób zdjęcie podręcznika albo wklej tekst, a TripleTalk zrobi z niego fiszki z tłumaczeniem, przykładami i wymową. Za darmo na iOS i Androida.",
    shareTitle: "TripleTalk – fiszki AI z Twoich własnych materiałów",
    shareDescription:
      "Zrób zdjęcie podręcznika albo wklej tekst, a TripleTalk zrobi z niego fiszki z tłumaczeniem, przykładami i wymową. Za darmo na iOS i Androida.",
    imageAlt:
      "TripleTalk: zrób zdjęcie i ucz się słówek. Ekrany aplikacji z fiszkami AI.",
    locale: "pl_PL",
  },
  en: {
    title: "AI vocabulary flashcards from your own materials | TripleTalk",
    description:
      "Snap a textbook page or paste any text, and TripleTalk turns it into flashcards with translations, examples and pronunciation. Free on iOS and Android.",
    shareTitle: "TripleTalk – AI flashcards from your own materials",
    shareDescription:
      "Snap a textbook page or paste any text, and TripleTalk turns it into flashcards with translations, examples and pronunciation. Free on iOS and Android.",
    imageAlt:
      "TripleTalk: snap a photo and learn the words. App screens with AI flashcards.",
    locale: "en_US",
  },
} as const;

export const landingContent = {
  pl: {
    navigation: {
      label: "Główna nawigacja",
      brandHome: "Strona główna TripleTalk",
      menuOpen: "Otwórz menu",
      features: "O aplikacji",
      how: "Jak to działa",
      teachers: "Dla nauczycieli",
      pricing: "Premium",
      languageLabel: "Język strony",
    },
    hero: {
      eyebrow: "Fiszki AI do nauki języków",
      title: "Ucz się słówek z\u00a0własnych materiałów.",
      description:
        "Zrób zdjęcie podręcznika albo wklej tekst. TripleTalk przygotuje fiszki z tłumaczeniami, przykładami i wymową. Ucz się na ekranie albo słuchaj lekcji w trybie audio, w drodze do pracy czy na spacerze.",
      downloadLabel: "Pobierz aplikację",
      appStoreLabel: "Pobierz w App Store",
      googlePlayLabel: "Pobierz z Google Play",
      appStoreCaption: "Pobierz w",
      googlePlayCaption: "Pobierz z",
      previewLabel: "Podgląd aplikacji TripleTalk",
      imageAlt:
        "Ekran Kolekcje w TripleTalk z gotowymi zestawami fiszek według tematu i poziomu",
    },
    useCases: {
      eyebrow: "Twój materiał. Twoja lekcja.",
      title: "Każdy materiał może stać się Twoją lekcją.",
      description:
        "Szykujesz prezentację, wybierasz się w podróż albo uczysz się do egzaminu? Zobacz, jakie fiszki TripleTalk przygotuje z Twoich materiałów.",
      tabsLabel: "Wybierz cel nauki",
      cardEyebrow: "TripleTalk AI przygotowuje fiszki",
      processText: "Twój materiał",
      processFlashcards: "Gotowe fiszki",
      items: [
        {
          id: "presentation",
          label: "Prezentacja",
          title: "Wystąpienie po angielsku bez stresu",
          description:
            "Wklej tekst slajdów albo notatki do wystąpienia. Przećwiczysz słowa, których potrzebujesz, i nie zabraknie Ci ich w połowie zdania.",
          cards: [
            { front: "key message", back: "główna myśl" },
            { front: "conclusion", back: "podsumowanie" },
            { front: "audience", back: "publiczność" },
          ],
        },
        {
          id: "travel",
          label: "Podróże",
          title: "Dogadaj się na wyjeździe",
          description:
            "Lotnisko, hotel, restauracja. Wklej plan podróży albo zrób zdjęcie przewodnika, a przed wyjazdem poznasz słówka, które naprawdę się przydadzą.",
          cards: [
            { front: "reservation", back: "rezerwacja" },
            { front: "boarding pass", back: "karta pokładowa" },
            { front: "check-in", back: "odprawa" },
          ],
        },
        {
          id: "business",
          label: "Spotkanie biznesowe",
          title: "Pewnie na spotkaniu z klientem",
          description:
            "Wklej agendę albo notatki. Wejdziesz na spotkanie z gotowym słownictwem, zamiast szukać słów w trakcie rozmowy.",
          cards: [
            { front: "agenda", back: "plan spotkania" },
            { front: "deadline", back: "termin" },
            { front: "follow-up", back: "dalszy kontakt" },
          ],
        },
        {
          id: "studies",
          label: "Studia",
          title: "Spokojnie przez sesję",
          description:
            "Zrób zdjęcie notatek z wykładu albo wklej fragment podręcznika. Najważniejsze pojęcia będą czekać w fiszkach, gotowe do powtórki przed egzaminem.",
          cards: [
            { front: "lecture", back: "wykład" },
            { front: "research", back: "badania" },
            { front: "exam", back: "egzamin" },
          ],
        },
        {
          id: "interview",
          label: "Rozmowa kwalifikacyjna",
          title: "Zrób dobre wrażenie na rozmowie",
          description:
            "Wklej ogłoszenie o pracę. Nauczysz się słów związanych ze stanowiskiem i opowiesz o swoim doświadczeniu bez zawahania.",
          cards: [
            { front: "experience", back: "doświadczenie" },
            { front: "responsibilities", back: "obowiązki" },
            { front: "strengths", back: "mocne strony" },
          ],
        },
      ],
    },
    benefits: {
      eyebrow: "Dlaczego TripleTalk",
      title: "Wszystko, czego potrzebujesz do nauki słówek.",
      description:
        "Przepisywanie słówek, szukanie tłumaczeń i pilnowanie powtórek zabierają najwięcej czasu. TripleTalk zrobi to za Ciebie, a Ty możesz po prostu się uczyć.",
      items: [
        {
          icon: "camera",
          title: "Zdjęcie zamiast przepisywania",
          description:
            "Masz słówka w podręczniku, w notatkach albo w karcie dań? Zrób zdjęcie i zaznacz te, których chcesz się nauczyć. Resztą zajmie się TripleTalk.",
        },
        {
          icon: "collection",
          title: "Gotowe kolekcje",
          description:
            "Nie masz własnych materiałów? Zacznij od gotowego zestawu fiszek, np. słówek na podróż, czasowników albo słownictwa na spotkanie z IT.",
        },
        {
          icon: "headphones",
          title: "Nauka ze słuchu",
          description:
            "Nie zawsze masz czas, żeby usiąść z telefonem. Włącz lekcję jak podcast i powtarzaj słówka na spacerze, na rowerze albo podczas treningu.",
        },
        {
          icon: "languages",
          title: "Dwa języki nauki",
          description:
            "Chcesz uczyć się dwóch języków naraz? TripleTalk został stworzony właśnie do tego. Powtarzaj oba języki w jednej sesji, zamiast poświęcać czas na każdy osobno.",
        },
        {
          icon: "repeat",
          title: "Powtórki we właściwym momencie",
          description:
            "Nie musisz pamiętać, co i kiedy powtórzyć. Nasz algorytm zadba o to za Ciebie i przypomni Ci każde słowo właśnie wtedy, gdy zaczynasz je zapominać.",
        },
        {
          icon: "voice",
          title: "Wymowa i przykłady",
          description:
            "Każde słowo usłyszysz wypowiedziane naturalnym głosem i zobaczysz w prawdziwym zdaniu. Dzięki temu łatwiej je zapamiętasz i użyjesz w rozmowie.",
        },
      ],
    },
    how: {
      eyebrow: "Jak to działa",
      title: "Od materiału do nauki w trzech prostych krokach.",
      description:
        "Nie musisz niczego przepisywać ani szukać w słowniku. Swoje pierwsze fiszki przygotujesz w kilka minut.",
      steps: [
        {
          number: "01",
          title: "Dodaj swój materiał",
          description:
            "Zrób zdjęcie strony z podręcznika, wklej tekst albo wpisz słowo, którego chcesz się nauczyć.",
        },
        {
          number: "02",
          title: "TripleTalk przygotuje fiszki",
          description:
            "Po chwili każde słowo ma tłumaczenie, przykładowe zdanie i nagranie wymowy.",
        },
        {
          number: "03",
          title: "Ucz się, kiedy chcesz",
          description:
            "Krótka sesja przy kawie albo lekcja audio na spacerze. TripleTalk podpowie Ci, co warto powtórzyć.",
        },
      ],
    },
    preview: {
      eyebrow: "Podgląd aplikacji",
      title: "Zobacz, jak TripleTalk pomaga Ci w nauce.",
      description:
        "Tak wygląda nauka z TripleTalk. Od zdjęcia dowolnego tekstu do pierwszej powtórki dzieli Cię tylko kilka chwil.",
      listLabel: "Zrzuty ekranu aplikacji TripleTalk",
      items: [
        {
          image: "/assets/tripletalk-word-selection.webp",
          imageAlt:
            "Ekran wyboru słówek w TripleTalk z liczbą znalezionych słów i listą do zaznaczenia",
          title: "Wybierz słówka ze zdjęcia",
          description:
            "TripleTalk AI znajduje słówka w tekście, a Ty zaznaczasz te, których chcesz się uczyć.",
        },
        {
          image: "/assets/tripletalk-review-session.webp",
          imageAlt:
            "Sesja nauki TripleTalk z fiszką, przykładowymi zdaniami i przyciskami oceny",
          title: "Powtarzaj we właściwym momencie",
          description:
            "Oceń, jak dobrze pamiętasz słowo, a aplikacja sama zaplanuje kolejną powtórkę.",
        },
        {
          image: "/assets/tripletalk-dashboard.webp",
          imageAlt:
            "Dashboard TripleTalk z serią dni nauki, liczbą fiszek i wykresem z ostatnich 7 dni",
          title: "Śledź swoje postępy",
          description:
            "Każdy dzień nauki przybliża Cię do celu. Zobacz, jak rośnie Twoja wiedza, i zachowaj motywację na dłużej.",
        },
      ],
    },
    school: {
      eyebrow: "Dla nauczycieli",
      title: "Przygotuj lekcje dla swoich uczniów.",
      description:
        "Uczysz w szkole, dajesz korepetycje albo prowadzisz kursy językowe? W zakładce Szkoła przygotujesz lekcje dla swoich uczniów, a oni nauczą się z nich na własnych telefonach, kiedy tylko chcą.",
      points: [
        "Utwórz klasę i zaproś do niej uczniów",
        "Przygotuj lekcję i udostępnij ją klasie w wybranym terminie",
        "Przeglądaj statystyki nauki twoich klas",
        "Uczniowie oszczędzają czas i uczą się z gotowych materiałów",
      ],
      linkLabel: "Jak działa Szkoła",
      linkHref: "/guide/#pl-10-szkoła-nauka-w-klasie",
      imageAlt:
        "Ekran klasy w TripleTalk z aktywnymi i zaplanowanymi lekcjami dla uczniów",
      statsImageAlt:
        "Ekran statystyk lekcji w TripleTalk z rozkładem wyników klasy oraz fiszkami znanymi najlepiej i najsłabiej",
    },
    pricing: {
      eyebrow: "Za darmo i Premium",
      title: "Zacznij za darmo.",
      description:
        "Na dobry początek dostajesz od nas w prezencie okres Premium i fiszki TripleTalk AI. Wypróbuj wszystko, a potem zdecyduj, czego naprawdę potrzebujesz.",
      plans: [
        {
          name: "Darmowe konto",
          price: "0 zł",
          priceNote: "na zawsze",
          badge: "",
          description: "Wszystko, czego potrzebujesz, żeby zacząć.",
          features: [
            "Fiszki z TripleTalk AI, nawet z pisma odręcznego*",
            "Tłumaczenie, przykładowe zdanie i wymowa na każdej fiszce",
            "Własne lekcje, do 400 fiszek w każdej",
            "Tłumaczenia na wszystkie języki dostępne w aplikacji",
            "Zaawansowany i sprawdzony mechanizm powtórek",
            "Odmiana czasowników i darmowe kolekcje",
            "Rola ucznia w Szkole",
          ],
          note: "* Wystarczy pakiet fiszek AI, bez subskrypcji.",
          featured: false,
        },
        {
          name: "Premium",
          price: "6,67 zł",
          priceNote: "miesięcznie*",
          badge: "Najwięcej możliwości",
          description: "Dla tych, którzy chcą więcej.",
          features: [
            "Wszystko z darmowego konta, a do tego:",
            "Nauka dwóch języków naraz",
            "Dużo więcej miejsca na lekcje",
            "Gotowe kolekcje Premium, od razu do nauki",
            "Odtwarzanie lekcji w trybie audio",
            "Przypomnienia, kiedy czas na powtórkę",
            "Rola nauczyciela w Szkole",
          ],
          note: "* Przy planie rocznym. Dokładną cenę pokaże App Store lub Google Play.",
          featured: true,
        },
      ],
    },
    faq: {
      eyebrow: "Pytania",
      title: "Najczęstsze pytania",
      items: [
        {
          question: "Czy TripleTalk jest darmowy?",
          answer:
            "Tak. Na darmowym koncie tworzysz własne lekcje, uczysz się jednego języka i korzystasz z powtórek oraz darmowych kolekcji. Na start dostajesz też pulę fiszek AI i okres Premium w prezencie.",
        },
        {
          question: "Skąd biorą się tłumaczenia i nagrania?",
          answer:
            "Przygotowuje je TripleTalk AI. Każdą fiszkę możesz potem przejrzeć i poprawić, a przykładowe zdania dopasować do swoich zainteresowań.",
        },
        {
          question: "Czy mogę korzystać z TripleTalk na kilku urządzeniach?",
          answer:
            "Tak. Zaloguj się na to samo konto, a lekcje, postępy i ustawienia będą takie same na telefonie i tablecie.",
        },
        {
          question: "Co dzieje się ze zdjęciami, które dodaję?",
          answer:
            "Służą wyłącznie do przygotowania fiszek. Usuwamy je razem z lekcją albo kontem.",
        },
      ],
      moreLabel: "Więcej odpowiedzi znajdziesz w instrukcji",
      contactTitle: "Nie ma tu Twojego pytania?",
      contactText: "Napisz do nas, chętnie pomożemy.",
      contactLabel: "Skontaktuj się z nami",
    },
    download: {
      eyebrow: "Pobierz",
      title: "Ucz się słownictwa, którego naprawdę potrzebujesz.",
      description:
        "Pobierz TripleTalk za darmo i zrób pierwsze fiszki ze swojego materiału jeszcze dziś.",
    },
    footer: {
      navigationLabel: "Nawigacja w stopce",
      privacy: "Polityka prywatności",
      terms: "Regulamin",
      guide: "Instrukcja",
      support: "Kontakt",
    },
  },
  en: {
    navigation: {
      label: "Main navigation",
      brandHome: "TripleTalk home",
      menuOpen: "Open menu",
      features: "About the app",
      how: "How it works",
      teachers: "For teachers",
      pricing: "Premium",
      languageLabel: "Site language",
    },
    hero: {
      eyebrow: "AI flashcards for language learning",
      title: "Learn vocabulary from your own materials.",
      description:
        "Snap a textbook page or paste text. TripleTalk creates flashcards with translations, examples and pronunciation. Learn on screen or listen to lessons in audio mode, on your commute or out for a walk.",
      downloadLabel: "Download the app",
      appStoreLabel: "Download on the App Store",
      googlePlayLabel: "Get it on Google Play",
      appStoreCaption: "Download on the",
      googlePlayCaption: "Get it on",
      previewLabel: "TripleTalk app preview",
      imageAlt:
        "TripleTalk Collections screen with ready-made flashcard sets by topic and level",
    },
    useCases: {
      eyebrow: "Your material. Your lesson.",
      title: "Any material can become your lesson.",
      description:
        "Preparing a presentation, getting ready for a trip or studying for an exam? See which flashcards TripleTalk makes from your materials.",
      tabsLabel: "Choose a learning goal",
      cardEyebrow: "TripleTalk AI creates your flashcards",
      processText: "Your material",
      processFlashcards: "Your flashcards",
      items: [
        {
          id: "presentation",
          label: "Presentation",
          title: "Present with confidence",
          description:
            "Paste your slides or speaking notes. You'll practise the words you need, so they don't slip away mid-sentence.",
          cards: [
            { front: "key message", back: "Kernbotschaft" },
            { front: "conclusion", back: "Fazit" },
            { front: "audience", back: "Publikum" },
          ],
        },
        {
          id: "travel",
          label: "Travel",
          title: "Get by on your trip",
          description:
            "Airport, hotel, restaurant. Paste your itinerary or snap a guidebook page, and before you leave you'll know the words you'll actually use.",
          cards: [
            { front: "reservation", back: "Reservierung" },
            { front: "boarding pass", back: "Bordkarte" },
            { front: "check-in", back: "Check-in" },
          ],
        },
        {
          id: "business",
          label: "Business meeting",
          title: "Walk into the meeting prepared",
          description:
            "Paste the agenda or your notes. You'll go in with the vocabulary ready instead of searching for words mid-conversation.",
          cards: [
            { front: "agenda", back: "Tagesordnung" },
            { front: "deadline", back: "Frist" },
            { front: "follow-up", back: "Nachbereitung" },
          ],
        },
        {
          id: "studies",
          label: "University",
          title: "Get through exam season calmly",
          description:
            "Snap your lecture notes or paste a passage from your textbook. The key terms will be waiting as flashcards, ready to review before the exam.",
          cards: [
            { front: "lecture", back: "Vorlesung" },
            { front: "research", back: "Forschung" },
            { front: "exam", back: "Prüfung" },
          ],
        },
        {
          id: "interview",
          label: "Job interview",
          title: "Make a great impression at your interview",
          description:
            "Paste the job ad. You'll learn the words that come with the role and talk about your experience without hesitating.",
          cards: [
            { front: "experience", back: "Erfahrung" },
            { front: "responsibilities", back: "Aufgaben" },
            { front: "strengths", back: "Stärken" },
          ],
        },
      ],
    },
    benefits: {
      eyebrow: "Why TripleTalk",
      title: "Everything you need to learn vocabulary.",
      description:
        "Copying out words, looking up translations and keeping track of reviews take up most of your time. TripleTalk does all that for you, so you can simply learn.",
      items: [
        {
          icon: "camera",
          title: "A photo instead of copying",
          description:
            "Got words in a textbook, your notes or a restaurant menu? Snap a photo and tick the ones you want to learn. TripleTalk takes care of the rest.",
        },
        {
          icon: "collection",
          title: "Ready-made collections",
          description:
            "No material of your own? Start with a ready-made flashcard set, for example travel words, verbs or vocabulary for IT meetings.",
        },
        {
          icon: "headphones",
          title: "Learn by listening",
          description:
            "You don't always have time to sit down with your phone. Play a lesson like a podcast and review words on a walk, on your bike or during a workout.",
        },
        {
          icon: "languages",
          title: "Two learning languages",
          description:
            "Want to learn two languages at once? TripleTalk was made for exactly that. Review both languages in one session instead of making time for each separately.",
        },
        {
          icon: "repeat",
          title: "Reviews at the right moment",
          description:
            "You don't have to remember what to review and when. Our algorithm takes care of it and brings each word back just as you're starting to forget it.",
        },
        {
          icon: "voice",
          title: "Pronunciation and examples",
          description:
            "You hear every word in a natural voice and see it in a real sentence. That way you'll remember it more easily and use it in conversation.",
        },
      ],
    },
    how: {
      eyebrow: "How it works",
      title: "From material to learning in three simple steps.",
      description:
        "You don't have to copy anything out or look things up in a dictionary. You can have your first flashcards ready in a few minutes.",
      steps: [
        {
          number: "01",
          title: "Add your material",
          description:
            "Snap a textbook page, paste some text or type a word you want to learn.",
        },
        {
          number: "02",
          title: "TripleTalk makes the flashcards",
          description:
            "A moment later every word has a translation, an example sentence and a pronunciation recording.",
        },
        {
          number: "03",
          title: "Learn whenever you like",
          description:
            "A short session over coffee or an audio lesson on a walk. TripleTalk shows you what's worth reviewing.",
        },
      ],
    },
    preview: {
      eyebrow: "App preview",
      title: "See how TripleTalk helps you learn.",
      description:
        "This is what learning with TripleTalk looks like. Only a few moments separate a photo of any text from your first review.",
      listLabel: "TripleTalk app screenshots",
      items: [
        {
          image: "/assets/tripletalk-word-selection.webp",
          imageAlt:
            "TripleTalk word selection screen with the number of words found and a list to tick",
          title: "Pick words from a photo",
          description:
            "TripleTalk AI finds the words in your text, and you tick the ones you want to learn.",
        },
        {
          image: "/assets/tripletalk-review-session.webp",
          imageAlt:
            "TripleTalk study session with a flashcard, example sentences and rating buttons",
          title: "Review at the right moment",
          description:
            "Rate how well you remember a word, and the app schedules the next review for you.",
        },
        {
          image: "/assets/tripletalk-dashboard.webp",
          imageAlt:
            "TripleTalk dashboard with a learning streak, flashcard totals and a chart of the last 7 days",
          title: "Track your progress",
          description:
            "Every day of learning brings you closer to your goal. Watch your knowledge grow and stay motivated for longer.",
        },
      ],
    },
    school: {
      eyebrow: "For teachers",
      title: "Prepare lessons for your students.",
      description:
        "Do you teach at a school, give private lessons or run language courses? In the School tab you prepare lessons for your students, and they learn from them on their own phones whenever they like.",
      points: [
        "Create a class and invite your students",
        "Prepare a lesson and share it with the class for the dates you choose",
        "Review your classes' learning statistics",
        "Students save time by learning from ready-made materials",
      ],
      linkLabel: "How School works",
      linkHref: "/en/guide/#en-10-school-learning-in-a-class",
      imageAlt:
        "TripleTalk class screen with active and scheduled lessons for students",
      statsImageAlt:
        "TripleTalk lesson statistics screen with the class's results and the flashcards known best and worst",
    },
    pricing: {
      eyebrow: "Free and Premium",
      title: "Start for free.",
      description:
        "To get you started, we give you a Premium trial and TripleTalk AI flashcards as a gift. Try everything, then decide what you really need.",
      plans: [
        {
          name: "Free account",
          price: "Free",
          priceNote: "forever",
          badge: "",
          description: "Everything you need to get started.",
          features: [
            "TripleTalk AI flashcards, even from handwriting*",
            "A translation, example sentence and audio on every card",
            "Your own lessons, up to 400 flashcards each",
            "Translations into every language in the app",
            "Advanced, proven spaced repetition",
            "Verb forms and free collections",
            "The student role in School",
          ],
          note: "* Just add an AI flashcard pack, no subscription.",
          featured: false,
        },
        {
          name: "Premium",
          price: "",
          priceNote: "monthly, quarterly or yearly plan",
          badge: "Get the most",
          description: "For when you want more.",
          features: [
            "Everything in Free, plus:",
            "Learn two languages at once",
            "Much more room for your lessons",
            "Ready-made Premium collections to start right away",
            "Play lessons in audio mode",
            "Reminders when it's time to review",
            "The teacher role in School",
          ],
          note: "You'll see the price in your currency in the App Store or Google Play.",
          featured: true,
        },
      ],
    },
    faq: {
      eyebrow: "Questions",
      title: "Frequently asked questions",
      items: [
        {
          question: "Is TripleTalk free?",
          answer:
            "Yes. On a free account you create your own lessons, learn one language, and use reviews and free collections. You also get a set of AI flashcards and a Premium trial as a welcome gift.",
        },
        {
          question: "Where do the translations and recordings come from?",
          answer:
            "TripleTalk AI prepares them. You can review and edit every flashcard, and tailor example sentences to your interests.",
        },
        {
          question: "Can I use TripleTalk on more than one device?",
          answer:
            "Yes. Sign in to the same account, and your lessons, progress and settings are the same on your phone and tablet.",
        },
        {
          question: "What happens to the photos I add?",
          answer:
            "They're used only to prepare flashcards. We delete them together with the lesson or your account.",
        },
      ],
      moreLabel: "Find more answers in the guide",
      contactTitle: "Can't find your question?",
      contactText: "Write to us, we're happy to help.",
      contactLabel: "Contact us",
    },
    download: {
      eyebrow: "Download",
      title: "Learn the vocabulary you really need.",
      description:
        "Download TripleTalk for free and make your first flashcards from your own material today.",
    },
    footer: {
      navigationLabel: "Footer navigation",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      guide: "Guide",
      support: "Contact",
    },
  },
} as const;
