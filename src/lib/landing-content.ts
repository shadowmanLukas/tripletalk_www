export type LandingLanguage = "pl" | "en";

export const landingSeo = {
  pl: {
    title: "TripleTalk AI Flashcards",
    description:
      "Twórz fiszki AI z tekstu i zdjęć. Ucz się szybciej dzięki inteligentnym powtórkom, tłumaczeniom i lekcjom audio.",
    locale: "pl_PL",
  },
  en: {
    title: "TripleTalk AI Flashcards",
    description:
      "Create AI flashcards from text and photos. Learn faster with smart repetition, translations and audio lessons.",
    locale: "en_US",
  },
} as const;

export const landingContent = {
  pl: {
    navigation: {
      label: "Główna nawigacja",
      brandHome: "Strona główna TripleTalk",
      menuOpen: "Otwórz menu",
      features: "Funkcje",
      download: "Pobierz",
      terms: "Regulamin",
      privacy: "Prywatność",
    },
    hero: {
      eyebrow: "Inteligentne Fiszki TripleTalk AI",
      title: "Zamień dowolny tekst w fiszki z TripleTalk AI.",
      description:
        "Wklej dowolny tekst lub zrób zdjęcie. TripleTalk AI automatycznie utworzy fiszki z tłumaczeniami, przykładami i nagraniami audio.",
      value: "Ucz się słów, których naprawdę potrzebujesz.",
      downloadLabel: "Pobierz aplikację",
      appStoreLabel: "Pobierz w App Store",
      googlePlayLabel: "Pobierz z Google Play",
      previewLabel: "Podgląd aplikacji TripleTalk",
      imageAlt:
        "Ekran aplikacji TripleTalk z zestawem fiszek i przyciskiem rozpoczęcia nauki",
    },
    useCases: {
      eyebrow: "Twój materiał. Twoja lekcja.",
      title: "Każdy materiał może stać się Twoją lekcją.",
      description:
        "Wklej tekst lub dodaj zdjęcie. TripleTalk AI wybierze najważniejsze słowa i utworzy gotowy zestaw fiszek.",
      tabsLabel: "Wybierz cel nauki",
      cardEyebrow: "TripleTalk AI przygotowuje fiszki",
      processText: "Tekst",
      processFlashcards: "Fiszki TripleTalk AI",
      processLearning: "Nauka",
      processPractice: "Ćwicz",
      items: [
        {
          id: "school",
          label: "Szkoła",
          title: "Przygotuj się do sprawdzianu",
          description:
            "Wklej materiał z lekcji. TripleTalk AI przygotuje fiszki z najważniejszym słownictwem.",
          cards: [
            { front: "vocabulary", back: "słownictwo" },
            { front: "homework", back: "praca domowa" },
            { front: "exam", back: "egzamin" },
          ],
        },
        {
          id: "presentation",
          label: "Prezentacja",
          title: "Przygotuj prezentację po angielsku",
          description:
            "Wklej treść slajdów i przećwicz słowa potrzebne podczas wystąpienia.",
          cards: [
            { front: "key message", back: "główna myśl" },
            { front: "conclusion", back: "podsumowanie" },
            { front: "audience", back: "publiczność" },
          ],
        },
        {
          id: "business",
          label: "Spotkanie biznesowe",
          title: "Przygotuj się do spotkania biznesowego",
          description:
            "Dodaj agendę lub notatki. TripleTalk AI utworzy zestaw słów do przećwiczenia.",
          cards: [
            { front: "agenda", back: "plan spotkania" },
            { front: "deadline", back: "termin" },
            { front: "follow-up", back: "dalszy kontakt" },
          ],
        },
        {
          id: "interview",
          label: "Rozmowa kwalifikacyjna",
          title: "Przygotuj się do rozmowy kwalifikacyjnej",
          description:
            "Wklej opis stanowiska i naucz się słów związanych z daną rolą.",
          cards: [
            { front: "experience", back: "doświadczenie" },
            { front: "responsibilities", back: "obowiązki" },
            { front: "strengths", back: "mocne strony" },
          ],
        },
        {
          id: "travel",
          label: "Podróże",
          title: "Przygotuj słownictwo na podróż",
          description:
            "Wklej materiały lub dodaj własny tekst. TripleTalk AI przygotuje słownictwo do hotelu, restauracji, lotniska i transportu.",
          cards: [
            { front: "reservation", back: "rezerwacja" },
            { front: "boarding pass", back: "karta pokładowa" },
            { front: "check-in", back: "odprawa" },
          ],
        },
      ],
    },
    how: {
      eyebrow: "Jak to działa",
      title: "Jak działa TripleTalk AI",
      description:
        "Wystarczą trzy kroki, aby zamienić własny materiał w gotowe fiszki i rozpocząć naukę.",
      steps: [
        {
          number: "01",
          icon: "document",
          title: "Dodaj materiał",
          description: "Wklej tekst lub dodaj zdjęcie.",
        },
        {
          number: "02",
          icon: "ai",
          title: "TripleTalk AI tworzy fiszki",
          description:
            "Automatycznie przygotowuje tłumaczenia, przykłady i nagrania audio.",
        },
        {
          number: "03",
          icon: "review",
          title: "Ćwicz i zapamiętuj",
          description:
            "Mechanizm inteligentnych powtórek pomaga utrwalić słownictwo na dłużej.",
        },
      ],
    },
    preview: {
      eyebrow: "Podgląd aplikacji",
      title: "Zobacz, jak TripleTalk pomaga Ci w nauce.",
      listLabel: "Zrzuty ekranu aplikacji TripleTalk",
      items: [
        {
          image: "/assets/tripletalk-add-flashcards.png",
          imageAlt:
            "Ekran TripleTalk pokazujący dodawanie fiszek ręcznie lub z TripleTalk AI",
          title: "Twórz fiszki z TripleTalk AI",
          description:
            "Wklej tekst lub dodaj zdjęcie. Resztę zrobi TripleTalk AI.",
        },
        {
          image: "/assets/tripletalk-audio-learning.png",
          imageAlt:
            "Ekran lekcji audio TripleTalk z odtwarzaniem zdania i sterowaniem nagraniem",
          title: "Ucz się skuteczniej",
          description:
            "Słuchaj lekcji audio i utrwalaj słownictwo dzięki inteligentnym powtórkom.",
        },
        {
          image: "/assets/tripletalk-progress-dashboard.png",
          imageAlt:
            "Panel postępów TripleTalk z liczbą fiszek, lekcji i wykresem nauki",
          title: "Śledź swoje postępy",
          description:
            "Monitoruj rozwój słownictwa i utrzymuj regularny rytm nauki.",
        },
      ],
    },
    download: {
      eyebrow: "Pobierz",
      title: "Ucz się słownictwa, którego naprawdę potrzebujesz.",
      description:
        "Pobierz TripleTalk i zamień własne materiały w fiszki TripleTalk AI.",
    },
    footer: {
      navigationLabel: "Nawigacja w stopce",
      privacy: "Polityka prywatności",
      terms: "Regulamin",
      support: "Pomoc",
    },
  },
  en: {
    navigation: {
      label: "Main navigation",
      brandHome: "TripleTalk home",
      menuOpen: "Open menu",
      features: "Features",
      download: "Download",
      terms: "Terms",
      privacy: "Privacy",
    },
    hero: {
      eyebrow: "Intelligent TripleTalk AI Flashcards",
      title: "Turn any text into TripleTalk AI flashcards.",
      description:
        "Paste any text or take a photo. TripleTalk AI automatically creates flashcards with translations, examples and audio recordings.",
      value: "Learn the words you really need.",
      downloadLabel: "Download the app",
      appStoreLabel: "Download on the App Store",
      googlePlayLabel: "Get it on Google Play",
      previewLabel: "TripleTalk app preview",
      imageAlt:
        "TripleTalk app screen with a flashcard set and a start learning button",
    },
    useCases: {
      eyebrow: "Your material. Your lesson.",
      title: "Any material can become your lesson.",
      description:
        "Paste text or add a photo. TripleTalk AI selects the most important words and creates a ready-to-learn flashcard set.",
      tabsLabel: "Choose a learning goal",
      cardEyebrow: "TripleTalk AI creates your flashcards",
      processText: "Text",
      processFlashcards: "TripleTalk AI flashcards",
      processLearning: "Learning",
      processPractice: "Practice",
      items: [
        {
          id: "school",
          label: "School",
          title: "Prepare for a test",
          description:
            "Paste your lesson material. TripleTalk AI creates flashcards with the most important vocabulary.",
          cards: [
            { front: "vocabulary", back: "Wortschatz" },
            { front: "homework", back: "Hausaufgaben" },
            { front: "exam", back: "Prüfung" },
          ],
        },
        {
          id: "presentation",
          label: "Presentation",
          title: "Prepare a presentation in English",
          description:
            "Paste your slides and practice the words you need during your presentation.",
          cards: [
            { front: "key message", back: "Kernbotschaft" },
            { front: "conclusion", back: "Fazit" },
            { front: "audience", back: "Publikum" },
          ],
        },
        {
          id: "business",
          label: "Business meeting",
          title: "Prepare for a business meeting",
          description:
            "Add an agenda or notes. TripleTalk AI creates a set of words to practice.",
          cards: [
            { front: "agenda", back: "Tagesordnung" },
            { front: "deadline", back: "Frist" },
            { front: "follow-up", back: "Nachbereitung" },
          ],
        },
        {
          id: "interview",
          label: "Job interview",
          title: "Prepare for a job interview",
          description:
            "Paste the job description and learn the vocabulary connected with the role.",
          cards: [
            { front: "experience", back: "Erfahrung" },
            { front: "responsibilities", back: "Aufgaben" },
            { front: "strengths", back: "Stärken" },
          ],
        },
        {
          id: "travel",
          label: "Travel",
          title: "Prepare vocabulary for your trip",
          description:
            "Paste materials or add your own text. TripleTalk AI prepares vocabulary for hotels, restaurants, airports and transport.",
          cards: [
            { front: "reservation", back: "Reservierung" },
            { front: "boarding pass", back: "Bordkarte" },
            { front: "check-in", back: "Check-in" },
          ],
        },
      ],
    },
    how: {
      eyebrow: "How it works",
      title: "How TripleTalk AI works",
      description:
        "It only takes three steps to turn your own material into ready-to-learn flashcards and start learning.",
      steps: [
        {
          number: "01",
          icon: "document",
          title: "Add your material",
          description: "Paste text or add a photo.",
        },
        {
          number: "02",
          icon: "ai",
          title: "TripleTalk AI creates flashcards",
          description:
            "Automatically prepares translations, examples and audio recordings.",
        },
        {
          number: "03",
          icon: "review",
          title: "Practice and remember",
          description: "Smart reviews help you remember vocabulary for longer.",
        },
      ],
    },
    preview: {
      eyebrow: "App preview",
      title: "See how TripleTalk helps you learn.",
      listLabel: "TripleTalk app screenshots",
      items: [
        {
          image: "/assets/tripletalk-add-flashcards.png",
          imageAlt:
            "TripleTalk screen for adding flashcards manually or with TripleTalk AI",
          title: "Create flashcards with TripleTalk AI",
          description:
            "Paste text or add a photo. TripleTalk AI does the rest.",
        },
        {
          image: "/assets/tripletalk-audio-learning.png",
          imageAlt:
            "TripleTalk audio lesson screen with sentence playback and audio controls",
          title: "Learn more effectively",
          description:
            "Listen to audio lessons and reinforce vocabulary with smart reviews.",
        },
        {
          image: "/assets/tripletalk-progress-dashboard.png",
          imageAlt:
            "TripleTalk progress dashboard with flashcard totals, lessons and a learning chart",
          title: "Track your progress",
          description:
            "Track your vocabulary growth and maintain a consistent learning routine.",
        },
      ],
    },
    download: {
      eyebrow: "Download",
      title: "Learn the vocabulary you really need.",
      description:
        "Download TripleTalk and turn your own materials into TripleTalk AI flashcards.",
    },
    footer: {
      navigationLabel: "Footer navigation",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      support: "Support",
    },
  },
} as const;
