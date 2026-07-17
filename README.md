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

Aktualne reguły znajdują się w sąsiednim repozytorium `tripletalk`. Przygotowane patche zachowują istniejącą walidację tworzenia feedbacku i dodają tylko uprawnienia administratora:

- [firebase-rules/firestore.rules.patch](firebase-rules/firestore.rules.patch)
- [firebase-rules/storage.rules.patch](firebase-rules/storage.rules.patch)

Sprawdzenie i zastosowanie lokalne, uruchamiane z katalogu `tripletalk_www`:

```bash
git -C ../tripletalk apply --check ../tripletalk_www/firebase-rules/firestore.rules.patch
git -C ../tripletalk apply --check ../tripletalk_www/firebase-rules/storage.rules.patch
git -C ../tripletalk apply ../tripletalk_www/firebase-rules/firestore.rules.patch
git -C ../tripletalk apply ../tripletalk_www/firebase-rules/storage.rules.patch
```

Po przeglądzie zmian reguły można wdrożyć z repozytorium mobilnym:

```bash
cd ../tripletalk
firebase deploy --only firestore:rules,storage
```

Pobieranie załączników przez `getBlob()` wymaga także CORS bucketu. Gotowa konfiguracja znajduje się w [firebase-rules/storage.cors.json](firebase-rules/storage.cors.json). Zastosuj ją osobno dopiero po przeglądzie:

```bash
gcloud storage buckets update gs://lexigo-b2aee.firebasestorage.app \
  --cors-file=../tripletalk_www/firebase-rules/storage.cors.json
```

CORS jedynie pozwala przeglądarce wysyłać żądania z `tripletalk.app`; każde żądanie nadal podlega Firebase Authentication i Storage Security Rules. Jeśli panel ma być testowany z domeny preview Cloudflare, dodaj jej dokładny origin do pliku przed ustawieniem CORS. Nie używaj publicznego wildcardu jako zamiennika reguł.

Nie wdrażaj reguł przed utworzeniem kopii/commita bieżącego stanu i ich przetestowaniem. Reguły nie są wdrażane automatycznie przez build strony.

Zmiana Firestore pozwala administratorowi czytać i usuwać feedback oraz aktualizować wyłącznie `status`, `completedAt` i `completedBy`. Zwykły użytkownik nadal może jedynie utworzyć własne zgłoszenie zgodnie z dotychczasową walidacją. Zmiana Storage pozwala administratorowi czytać i usuwać załączniki z `feedback`; nie dodaje publicznego dostępu ani możliwości uploadu przez administratora.

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
