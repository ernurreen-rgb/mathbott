# Production deploy — 2026-11-02

Қолданылған код: `a30708a8fe10009a617b2ed376c281490144cdc8`.

| Жоба | Негізгі URL | Жаңа deployment | Күйі |
| --- | --- | --- | --- |
| API — qazmath-api | https://qazmath-api.vercel.app | `dpl_6jQBRPAeSN7SjGTkYwjx3D5Mo3NC` | READY, production alias расталды |
| Web — qazmath | https://qazmath.vercel.app | `dpl_GTXSkjL6tUhfrXABwQxXUWazsqLq` | READY, production alias расталды |

API Python 3.12 арқылы, web Node 24 тармағында құрылды. Vercel metadata-сы екі deployment үшін де sourceCommit мәнін және негізгі домендердің жаңа deployment ID-лерге бағытталғанын растады.

Код таза Git export-тан жүктелді; local `.env.local`, user DOCX файлдары және node_modules deploy artifact-іне кірген жоқ. Алдымен API production environment-пен `--skip-domain` арқылы құрылып, жеке URL-да health тексерілді. API promotion-нан кейін ескі web proxy-мен үйлесімділігі расталды. Содан кейін web те жеке URL-да тексеріліп, production-ға promoted болды.

## Тексерістер

- PostgreSQL: барлық алты migration қолданылған; checksum mismatch жоқ, A10 quota кестесі бар. Осы deploy кезінде schema migration орындалған жоқ.
- API health, web root, quiz catalogue page, proxy health, Google Auth providers және CSRF endpoint: **HTTP 200**.
- Public quizzes API және modules map: **HTTP 200**.
- Авторизациясыз private web proxy және direct admin API: **HTTP 401**.
- Direct unsigned PIN lookup: **401**; web proxy қол қойған жоқ PIN lookup: **404**. Бұл сақталған sensitive proxy key-лердің runtime-да үйлесімді екенін растады.
- Бес Next.js static asset: **HTTP 200**. Production CSP ішінде unsafe-eval жоқ.
- Browser API base — `/api/backend`, realtime transport — `polling`; Google credential variables production environment-те бар.

Sensitive proxy/Auth/S3 мәндері оқылып жарияланған немесе ауыстырылған жоқ; cloud runtime-ға Vercel өзі береді. [Құрылымдық нәтиже](production-a30708a.json) secret мәндерін, session/CSRF token-дерін немесе task/student мазмұнын сақтамайды.

Google account sign-in интерактивті түрде толық орындалмады. Production-да quiz/answer/admin write fixture құрылған жоқ. Active bank tasks және quiz questions ішінде image_filename үлгісі табылмағандықтан positive image read/upload тексерісі орындалмады. Backup restore drill және толық staging/browser E2E бөлек жұмыс болып қалады.

## Алдыңғы deployment-тер

| Жоба | Бұрынғы production deployment |
| --- | --- |
| Web | `dpl_BpqqVaMEfFpbGaoEg2VfZukPbUV2` |
| API | `dpl_Efi3yb3WPzqDyFShkTZDFCmaooZG` |

Қажет болғанда алдымен `web/`, кейін `bot/` linked directory-лерінен тиісті алдыңғы ID үшін `vercel promote <deploymentId> --yes` орындалады. Осы release schema-ны өзгертпегендіктен migration rollback қажет емес. Rollback бұл deploy кезінде қолданылған жоқ.
