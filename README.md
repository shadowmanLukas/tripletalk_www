# TripleTalk WWW

Statyczna strona Astro dla `tripletalk.app`, wraz ze statycznym panelem administratora pod `/adminpanel`.

## Architektura

- Astro z routingiem plikowym w `src/pages`.
- Tailwind CSS przez Vite oraz istniejące style projektu.
- Wszystkie strony, łącznie z `/adminpanel`, są generowane do statycznych plików HTML/CSS/JS.
- Panel używa Firebase Web SDK bez SSR, własnego API, Firebase Admin SDK i procesu Node na produkcji.
- Authentication chroni sesję użytkownika, a custom claim `admin: true` i Firebase Security Rules egzekwują dostęp do danych.
- Firestore: projekt `lexigo-b2aee`, domyślna baza, kolekcja `feedback`.
- Storage: `lexigo-b2aee.firebasestorage.app`.

Node.js jest wymagany wyłącznie podczas instalacji zależności, testów i statycznego builda.

## Konfiguracja Firebase Web

W Firebase Console otwórz **Project settings → General → Your apps → Web app**. Jeżeli projekt nie ma aplikacji webowej, najpierw ją zarejestruj. Skopiuj wartości z obiektu `firebaseConfig` do zmiennych Cloudflare Pages:

- `PUBLIC_FIREBASE_API_KEY`
- `PUBLIC_FIREBASE_AUTH_DOMAIN`
- `PUBLIC_FIREBASE_PROJECT_ID=lexigo-b2aee`
- `PUBLIC_FIREBASE_STORAGE_BUCKET=lexigo-b2aee.firebasestorage.app`
- `PUBLIC_FIREBASE_APP_ID`
- `PUBLIC_ADMIN_FIREBASE_EMAIL` — e-mail konta Firebase Auth mapowanego w UI na login `admin`

Są to publiczne dane konfiguracyjne osadzane podczas builda. Nie ustawiaj hasła administratora jako zmiennej Cloudflare. Hasło należy ustawić lub zresetować wyłącznie w Firebase Authentication.

Konto administratora musi mieć custom claim:

```text
admin: true
```

Claim należy nadać przez zaufane narzędzie administracyjne lub backend aplikacji mobilnej korzystający z Firebase Admin SDK — nie z tej strony. Po zmianie claimu wyloguj użytkownika, aby panel pobrał świeży token.

## Security Rules

Aktualne reguły i indeksy znajdują się w sąsiednim repozytorium `tripletalk`. Zmiany potrzebne panelowi są tu trzymane jako patche: zachowują istniejącą walidację i dodają tylko uprawnienia odczytu dla administratora.

Już zastosowane w `tripletalk` (historia):

- [firebase-rules/firestore.rules.patch](firebase-rules/firestore.rules.patch): feedback.
- [firebase-rules/storage.rules.patch](firebase-rules/storage.rules.patch): załączniki feedbacku.
- [firebase-rules/admin-statistics.rules.patch](firebase-rules/admin-statistics.rules.patch): odczyt `users` i `users/*/lessons`.
- [firebase-rules/admin-statistics-collection-group.rules.patch](firebase-rules/admin-statistics-collection-group.rules.patch): odczyt `collectionGroup("lessons")`.

Do zastosowania, w tej kolejności (sprawdzone na `tripletalk` `main` z 2026-10-01, testy reguł 79/79):

1. [firebase-rules/remove-admin-ai-uploads.rules.patch](firebase-rules/remove-admin-ai-uploads.rules.patch) usuwa nieużywany już odczyt `collectionGroup("lexiAiUploads")` przez admina (po usunięciu zakładki Costs).
2. [firebase-rules/admin-learning-activity.rules.patch](firebase-rules/admin-learning-activity.rules.patch) pozwala adminowi czytać `collectionGroup("learningStats")` (miara aktywności w User Stats).
3. [firebase-rules/admin-school-stats.rules.patch](firebase-rules/admin-school-stats.rules.patch) pozwala adminowi czytać `schoolUsers`, `schoolClasses`, `schoolLessons`, `schoolMemberships`, `schoolAssignments` i `schoolProgress` (School Stats). Kody uczniów, blokady, liczniki limitów i karty pozostają niedostępne.
4. [firebase-rules/admin-user-stats.indexes.patch](firebase-rules/admin-user-stats.indexes.patch) (indeksy, nie reguły) włącza indeksy collection group dla `lessons.createdFromCommonCollection` i `learningStats.date`, z zachowaniem domyślnych indeksów kolekcji tych pól.

Patche 1–3 dodają też testy w `rules-tests/admin-panel.rules.test.js` (emulator). Sprawdzenie, zastosowanie i testy, uruchamiane z katalogu `tripletalk_www`:

```bash
for patch in remove-admin-ai-uploads.rules admin-learning-activity.rules admin-school-stats.rules admin-user-stats.indexes; do git -C ../tripletalk apply ../tripletalk_www/firebase-rules/$patch.patch || break; done
```

```bash
cd ../tripletalk/rules-tests && npm test
```

Patche trzeba nakładać po kolei, bo każdy kolejny zakłada stan po poprzednim. Pojedynczo: `git -C ../tripletalk apply --check ../tripletalk_www/firebase-rules/<plik>.patch`.

Po przeglądzie zmian reguły można wdrożyć z repozytorium mobilnym:

```bash
cd ../tripletalk
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Pobieranie załączników przez `getBlob()` wymaga także CORS bucketu. Gotowa konfiguracja znajduje się w [firebase-rules/storage.cors.json](firebase-rules/storage.cors.json). Zastosuj ją osobno dopiero po przeglądzie:

```bash
gcloud storage buckets update gs://lexigo-b2aee.firebasestorage.app \
  --cors-file=../tripletalk_www/firebase-rules/storage.cors.json
```

CORS jedynie pozwala przeglądarce wysyłać żądania z `tripletalk.app`; każde żądanie nadal podlega Firebase Authentication i Storage Security Rules. Jeśli panel ma być testowany z domeny preview Cloudflare, dodaj jej dokładny origin do pliku przed ustawieniem CORS. Nie używaj publicznego wildcardu jako zamiennika reguł.

Nie wdrażaj reguł przed utworzeniem kopii/commita bieżącego stanu i ich przetestowaniem. Reguły nie są wdrażane automatycznie przez build strony.

Zmiana Firestore pozwala administratorowi czytać i usuwać feedback oraz aktualizować wyłącznie `status`, `completedAt` i `completedBy`. Zwykły użytkownik nadal może jedynie utworzyć własne zgłoszenie zgodnie z dotychczasową walidacją. Zmiana Storage pozwala administratorowi czytać i usuwać załączniki z `feedback`; nie dodaje publicznego dostępu ani możliwości uploadu przez administratora.

Osobny patch statystyk pozwala administratorowi wyłącznie odczytywać dokumenty `users` i `users/*/lessons`. Panel używa ich do agregatów liczbowych; prywatne podkolekcje użytkowników i operacje zapisu pozostają niedostępne.

Uzupełniający patch collection group zezwala administratorowi na odczyt zapytań `collectionGroup("lessons")`, których panel używa do zsumowania liczby lekcji i pól `flashcardCount`.

Indeks `lessons.createdFromCommonCollection` pozwala User Stats liczyć lekcje i fiszki zapytaniami agregującymi (`count()`/`sum()`) zamiast pobierać każdą lekcję. Bez niego panel działa dalej, ale czyta wszystkie dokumenty lekcji i pokazuje o tym informację. Bez reguły lub indeksu dla `learningStats` kafelki aktywności pokazują „Activity data unavailable” z nazwą brakującego patcha, a reszta zakładki działa normalnie.

## User Stats

Zakładka `/adminpanel#user-stats` (dawniej Statistics; stary adres `#statistics` przekierowuje) pokazuje:

- **Users now:** liczbę kont, aktywne premium (`premiumIsActive`) oraz aktywnych uczących się z ostatnich 7 i 30 dni. Aktywny uczący się to użytkownik, który danego dnia oznaczył co najmniej jedną fiszkę jako znaną (`users/{uid}/learningStats/{dzień}`, lokalna data urządzenia). `lastSignInAt` nie jest używane, bo zmienia się tylko przy jawnym logowaniu, a nie przy otwarciu aplikacji.
- **Content now:** lekcje i fiszki tworzone przez użytkowników (bez gotowych kolekcji) oraz średnie.
- **Wykres dzienny** dla wybranego zakresu (domyślnie 30 dni, najwyżej 180) z przełącznikiem: nowi użytkownicy (po `createdAt`, dzień UTC) albo aktywni uczący się (dokumenty `learningStats` z danego dnia; lokalną datę dopasowuje okno ±12 h wokół północy UTC).
- Podział kont na metodę logowania (`authProvider`) i aktywnego premium na źródło (`premiumSource`).

Wszystko jest liczone zapytaniami `count()`/`sum()`, bez pobierania dokumentów użytkowników. Jedynym wyjątkiem są liczby różnych aktywnych użytkowników z 7 i 30 dni: tego nie da się policzyć po stronie serwera, więc panel czyta dokumenty `learningStats` z ostatnich 30 dni (jeden mały dokument na użytkownika i dzień, najwyżej 10 000, czyli maksymalny limit zapytania Firestore). Wyniki są cache'owane do odświeżenia albo wylogowania, a dzisiejszy dzień jest zawsze liczony od nowa.

## School Stats

Zakładka `/adminpanel#school-stats` pokazuje stan funkcji Szkoła (struktura danych: `docs/school/SPEC.md` w repozytorium `tripletalk`):

- **People:** konta Szkoły, nauczyciele, uczniowie, uczniowie w klasach (zaakceptowane członkostwa).
- **Classes and lessons:** klasy (ze średnią uczniów na klasę), lekcje nauczycieli (w tym opublikowane, czyli zablokowane), karty (`cardCount`), przypisania lekcji do klas (w tym aktywne lub zaplanowane, `availableTo` w przyszłości).
- **Learning and health:** rozpoczęte przypisania (`schoolProgress`), postęp z ostatnich 7 dni oraz suma kart z oczekującym i nieudanym audio.
- **Wykres dzienny** z przełącznikiem: nowe konta Szkoły, lekcje opublikowane do klas, przypisania rozpoczęte przez uczniów.
- Tabele: role, statusy zaproszeń do klas, stany publikacji przypisań.

Panel używa wyłącznie zapytań `count()`/`sum()` i nie pobiera imion, kodów uczniów ani treści kart. Wymaga patcha `admin-school-stats.rules.patch`; bez niego zakładka pokazuje komunikat o braku uprawnień. Zaproszenia „expired” są w danych zwykłym `pending` (aplikacja wylicza wygaśnięcie z `expiresAt`), więc panel liczy je jako oczekujące.

## Functions Stats

Zakładka `/adminpanel#functions-stats` pokazuje dzienne zużycie płatnych API (tokeny Gemini i znaki Google Text-to-Speech) w podziale na Cloud Functions. Źródłem prawdy o danych jest `docs/functions/STATISTICS.md` w repozytorium `tripletalk`.

- Raporty są budowane z agregatów `statistics/aiUsage/daily` i `statistics/aiUsage/dailyByFunction` (zakres do 180 dni, plus 7 dni wcześniej jako punkt odniesienia dla alertów). Surowe `events` są czytane tylko po włączeniu „Include today”, dla dni po ostatniej agregacji (najwyżej 3 dni, do 5000 zdarzeń na dzień).
- Wszystkie daty to dni UTC. Panel pokazuje czas ostatniej agregacji i ostrzega, gdy jest starsza niż 36 godzin.
- Koszt jest szacunkiem liczonym w przeglądarce z cennika w [src/lib/ai-pricing.ts](src/lib/ai-pricing.ts) (ceny za 1M tokenów dla modeli Gemini i za 1M znaków dla typów głosów TTS, z datą obowiązywania i linkami do cenników Google). Model albo głos bez ceny jest pokazywany jako „no price”, nie jako 0. Przy zmianie cen Google zaktualizuj ten plik.
- Alerty: średnie wyjście na wywołanie operacji Gemini ponad 2 razy wyższe niż średnia z poprzednich 7 dni oraz dzienny koszt funkcji powyżej progu. Próg ustawia się w panelu i jest zapamiętywany tylko w tej przeglądarce.
- Wyniki dla tego samego zakresu są cache'owane do odświeżenia albo wylogowania.

Odczyt wymaga reguły `match /statistics/{document=**} { allow read: if isAdmin(); }`, która jest już w `firestore.rules` repozytorium `tripletalk`. Ten panel nie potrzebuje do tego osobnego patcha i nigdy nie zapisuje do `statistics`.

Panel ma tryb jasny i ciemny. Domyślnie działa według ustawienia systemu, a przycisk w nagłówku zapamiętuje wybór w tej przeglądarce.

## Lokalna weryfikacja

Skopiuj `.env.example` do nieśledzonego `.env` i uzupełnij publiczną konfigurację Firebase Web, a następnie:

```bash
npm ci
npm run format:check
npm run lint
npm run check
npm test
npm run build
npm run preview
```

## Cloudflare Pages

Konfiguracja projektu:

- Framework preset: **Astro**
- Install command: `npm ci`
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Node version podczas builda: 22
- Zmienne builda: wszystkie zmienne `PUBLIC_*` wymienione powyżej

W Firebase Authentication dodaj `tripletalk.app` do **Settings → Authorized domains**.

Pliki `public/_redirects` i `public/_headers` są kopiowane do `dist`. Pierwszy zapewnia fallback `/adminpanel` i `/adminpanel/*` do statycznego `adminpanel/index.html`, a drugi ustawia `no-store`, `noindex` i podstawową CSP dla panelu.

Po ustawieniu zmiennych uruchom ponowne wdrożenie przez push do podłączonej gałęzi lub **Deployments → Retry deployment** w Cloudflare Pages. Zmienne `PUBLIC_*` są osadzane podczas builda, więc ich zmiana zawsze wymaga nowego deploymentu.

Żadne wdrożenie strony ani reguł Firebase nie jest wykonywane przez tę zmianę.
