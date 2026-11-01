# Mathbot: жоба аудиті және код ревьюі

Аудит күні: **2026-11-01**, Asia/Qyzylorda. Тексерілген revision: `61ed106ed08a781e09fe42fdc641a10c5b26cb93`.

Аудиттен кейінгі өзгерістер: [түзету барысы](/E:/CursorMathbot/docs/audit/2026-11-01/FIX_PROGRESS.md). Төмендегі нәтижелер аудит сәтіндегі revision-ға қатысты.

**13 мәселе анықталды: 1 × P1, 11 × P2, 1 × P3.** Оның 12-сі қолданба кодындағы қайта жасалған ақау, біреуі тәуелділіктер мен CI security gate туралы. Негізгі қауіптер: редакторда дерек жоғалту, тарихи суреттердің жойылуы, жауап кілтінің ерте ашылуы және қатар сұраулар кезіндегі қателер. Қолданыстағы 756 тест өтті; жаңа репродукциялар осы тесттер қамтымаған сценарийлерді көрсетті.

P1 — келесі релизге дейін түзету қажет; P2 — жоспарлы түрде жақын арада түзету қажет; P3 — әсері шектеулі функционалдық қате. Бұл басымдықтар dependency advisory-дегі CVSS/severity бағасынан бөлек.

Аудит кезінде қолданба коды өзгертілген жоқ. Осы каталогқа есеп, орындалатын репродукциялар және тексеру журналдары қосылды. Жұмыс каталогындағы бастапқы екі untracked DOCX файлына өзгеріс енгізілген жоқ.

## Қамту және тәсіл

Негізгі агентке қосымша үш агент пайдаланылды:

| Бағыт | Тексерілген бөліктер |
| --- | --- |
| Backend қауіпсіздігі | Proxy HMAC/body binding, identity middleware, RBAC, admin/user/export/friends, guest quiz, WebSocket auth, public payload |
| Деректер және бизнес логика | Quiz/trial/co-op транзакциялары, нәтижелер, progress, SQLite/PostgreSQL шекарасы, connection pool, migrations, user creation |
| Frontend | Quiz hooks, draft/sync, trial/co-op беттері, quiz редакторы, bank/CMS әрекеттері, API client, auth proxy, presence/math input |
| Негізгі агент | Нәтижелерді қайта тексеру, толық тесттер/build/lint/typecheck, математикалық нормализация, storage/metrics, Docker/CI/deploy, dependency audit |

Жоба құрылымы: Next.js App Router және Google OAuth → Next.js API proxy → FastAPI → repositories → SQLite немесе PostgreSQL; суреттер local filesystem немесе S3 арқылы сақталады. Proxy сұраудың identity/body деректерін қолтаңбамен байланыстырады. Quiz/trial submit транзакциялары мен snapshot/deduplication қорғаныстары бар.

## Нақты мәселелер

### A01 · P1 · Сұрақтарды жүктеу қатесі квиз мазмұнының жойылуына әкеледі

Код: [edit/page.tsx:65](/E:/CursorMathbot/web/app/quizzes/[id]/edit/page.tsx:65), [QuizEditor.tsx:327](/E:/CursorMathbot/web/app/quizzes/_components/QuizEditor.tsx:327), [quiz_repository.py:93](/E:/CursorMathbot/bot/repositories/quiz_repository.py:93).

Metadata сұрауы сәтті, questions сұрауы қате қайтарса, `questionsRes.error` ескерілмейді. Бет `[]` арқылы қалыпты редакторды ашады; редактор оны жаңа бос сұрақ ретінде көрсетеді. Пайдаланушы жаңа сұрақты толтырып Save басқанда тек жаңа массив жіберіледі. Backend берілген `questions` массивін толық replacement ретінде өңдеп, бұрынғы `quiz_questions` жолдарын жояды.

Репродукция: metadata OK + questions `{data:null,error:...}` → экранда жүктеу қатесі жоқ → жаңа сұрақты толтыру → replacement-only payload. Оқшауланған Jest тексерісі өтті. Бұл қате пайдаланушыға бастапқы мазмұнның жүктелмегенін білдірмейді, сондықтан кәдімгі сақтау әрекеті деректі жоғалтады.

Түзету: екі сұраудың да сәтті аяқталғанын тексеру; сұрақтар толық жүктелмей editor/save ашпау; қатені және retry әрекетін көрсету. Регрессия тексерісі metadata OK/questions failure кезінде Save мүмкін болмауын бекітуі тиіс.

### A02 · P2 · VERSION_CONFLICT кейін ескі форма басқа редактордың өзгерісін басып жазады

Код: [bank/page.tsx:315](/E:/CursorMathbot/web/app/admin/bank/page.tsx:315), сол файлдағы payload token — 303-жол.

v1 формасын сақтағанда сервер v2 туралы conflict қайтарса, UI тек `currentVersion` токенін v2-ге ауыстырады. Форманың мәтіні, жауабы және опциялары v1 күйінде қалады. Save-ті қайта басу жаңа токенмен ескі мазмұнды жібереді; optimistic locking енді оны қабылдайды.

Репродукция: бірінші сұрауда expected version `1`, conflict-тен кейінгі екінші сұрауда `2`, бірақ мәтін әлі `old text from v1`. Оқшауланған Jest тексерісі өтті.

Түзету: бастапқы version token-ін сақтау; сервердің жаңа нұсқасын жүктеп merge/reload жасау немесе бөлек, анық белгіленген overwrite әрекетін ұсыну. Кәдімгі retry қорғанысты айналып өтпеуі керек.

### A03 · P2 · Bank тазалауы тарихи нәтижелердегі суреттерді жояды

Код: [crud.py:631](/E:/CursorMathbot/bot/repositories/bank/crud.py:631); қолмен permanent delete те солай істейді: [bank.py:820](/E:/CursorMathbot/bot/routes/admin/bank.py:820). Snapshot суретке filename арқылы сілтейді: [public_payload.py:39](/E:/CursorMathbot/bot/utils/public_payload.py:39).

Retention аяқталғанда bank жолы жойылып, оның ағымдағы суреті reference check жасалмай өшіріледі. Бұрын сақталған trial нәтижесі сол файлға әлі сілтей алады. Осылайша суретке негізделген тапсырманың тарихи review беті толық емес болады. Өзгерту кезінде ескі суреттерді сақтау шарасы purge жолында сақталмайды.

Репродукция: суретті bank тапсырмасы → сақталған trial attempt → bank-ті ескі deleted күйіне қою → cleanup. `purged_tasks=1`, `saved_results_remaining=1`, тарихи filename бар, `image_exists_after=false`.

Түзету: live placements, versions және result/quiz snapshots сілтемелерін ескеретін asset retention/garbage collection жасау. Тарих сақталғанша суретті сақтау; automatic және manual purge жолдарының екеуіне де қолдану.

### A04 · P2 · Nested connection acquisition pool-ды тауысып, толық емес сабақ қалдырады

Код: [curriculum_repository.py:180](/E:/CursorMathbot/bot/repositories/curriculum_repository.py:180); екінші acquire — 185-жол; PostgreSQL pool capacity — [database.py:51](/E:/CursorMathbot/bot/database.py:51).

`create_lesson()` бірінші connection-ды ұстап тұрып, екінші connection алатын `ensure_default_mini_lessons()` шақырады. Екі қатар creation PostgreSQL-дегі екі connection-ды алып, бір-бірін босатуды күтеді. Lesson INSERT бұған дейін commit болғандықтан, timeout кейін сабақтар сақталып, mini-lessons құрылмай қалады.

Репродукция PostgreSQL capacity-іне тең SQLite pool арқылы, екі сұраудың заңды interleaving-ін barrier-мен бекітіп жасалды: екі `TimeoutError`, екі сақталған сабақ, mini-lesson counts `[0,0]`. Production timeout — 30 секунд; репродукцияда күту қысқартылды. Бұл нақты PostgreSQL server-де орындалған тест емес, connection ownership/pool логикасының детерминдік тексерісі.

Түзету: lesson және mini-lessons-ты бір connection/transaction арқылы атомарлы құру. Осындай nested task lookup үлгісін `StatisticsRepository` ішінде де жою. Қолданыстағы DB test fixtures `use_pool=False` қолданатындықтан, pool concurrency сценарийін бөлек қамту қажет.

### A05 · P2 · Аяқтамаған co-op қатысушысы толық жауап кілтін алады

Код: [trial_tests_coop.py:328](/E:/CursorMathbot/bot/routes/trial_tests_coop.py:328).

Results endpoint тек session membership тексереді. A қатысушысы аяқтағаннан кейін оның review нәтижелері, соның ішінде дұрыс жауаптар мен task snapshots, әлі орындап жатқан B-ға беріледі. A бос жауаптармен аяқтаса да, жауап кілті қолжетімді.

Репродукция: A бос жауаптармен submit → B results алады → `b_is_finished=0`, session `active`, peer `correct_answer="4"`.

Түзету: толық review-ді сұраған қатысушының аяқтағанын немесе бүкіл session аяқталғанын тексеру. Ойын жүріп жатқанда қажет leaderboard/status дерегін шешімдерден бөлек қайтару.

### A06 · P2 · Student options ішінде шешім metadata-сы ашылады

Код: [trial_tests.py:154](/E:/CursorMathbot/bot/routes/trial_tests.py:154), [modules.py:284](/E:/CursorMathbot/bot/routes/modules.py:284); кіріс dict қосымша өрістерін сақтайды: [content_validation.py:146](/E:/CursorMathbot/bot/routes/admin/content_validation.py:146).

Student serializer `options` тізімін өзгеріссіз қайтарады. Bank create қабылдаған option dict ішінде `correct`, `answer` немесе басқа шешім өрісі болса, ол тапсырманы орындауға дейін ашылады. Бұл үшін legacy/import/manual JSON ішінде қосымша metadata болуы қажет; тек label/text бар қалыпты option-дарда артық дерек жоқ.

Репродукция нақты қолтаңбалы production middleware арқылы өтті: admin bank create `200`, options ішінде `correct` және `answer`; trial-ға орналастыру; student details `200` сол өрістерді түгел қайтарды.

Түзету: барлық student payload үшін option-дарды рұқсат етілген `label`, `text` өрістерімен қайта құру. Quiz serializer-дегі whitelist тәсілін ортақ пайдалану. Blacklist жаңа metadata атауларын өткізіп жіберуі мүмкін.

### A07 · P2 · SPA навигациясы соңғы trial draft өзгерісін жоғалтады

Код: [trial-test/page.tsx:303](/E:/CursorMathbot/web/app/trial-test/[id]/page.tsx:303), unmount cleanup — 307-жол, writable key cleanup — 278-жол, `pagehide` cleanup — 325-жол.

Соңғы жауаптан кейін 800 мс өтпей Back/ішкі navigation жасалса, debounce timer тоқтатылады. SPA route ауысуы browser `pagehide` оқиғасын туғызбайды. Unmount кезінде snapshot жіберілмейді және writable key жойылады, сондықтан қайта кіргенде соңғы өзгеріс жоқ.

Репродукция: жауапты өзгерту → debounce аяқталмай unmount → timer-лерді өткізу; draft сақтау fetch-і жасалмады. Оқшауланған Jest тексерісі өтті.

Түзету: route/unmount алдында соңғы snapshot-ты writable key өшірілмей тұрып flush жасау. Submit аяқталғаннан кейін draft қайта құрылмауын және account/test ауысуында бөтен key-ге жазылмауын тексеру.

### A08 · P2 · Тұрақтыға ықшамдалатын алгебралық жауап дұрыс бағаланбайды

Код: [validation.py:231](/E:/CursorMathbot/bot/utils/validation.py:231), fallback — 240-жол.

Numeric parser `0`/`1` сияқты жай кілт қайтарады, ал algebra parser дәл сол мәнге ықшамдалған өрнекке `__algebra__:...` кілтін береді. Салыстыру осы екі canonical domain-ді біріктірмейді.

Репродукция: `is_task_answer_correct({question_type:"input",answer:"x-x"},"0") == False`; `x-x+1`/`1` және `0*x`/`0` да false. Бұлар domain шектеуінсіз математикалық тең өрнектер. `2*x-x`/`x` control case-і true, яғни algebra equivalence өзі іске қосылады.

Түзету: algebra нәтижесі тұрақты рационал сан болса, numeric parser қолданатын canonical representation-ға келтіру немесе екі parser нәтижесін бір typed canonical model-мен салыстыру. Нөл, бүтін және бөлшек constant нәтижелеріне регрессия қосу.

### A09 · P2 · Бірінші кірудегі қатар user creation 500 қатесін тудырады

Код: [user_repository.py:96](/E:/CursorMathbot/bot/repositories/user_repository.py:96); existence check — 72-жол.

User creation `SELECT` кейін қорғалмаған `INSERT` жасайды. Бір жаңа email үшін қатар сұраулар existence check-тен бірге өтіп, UNIQUE constraint-ке түседі. Web user endpoint осы auto-create flow-ды пайдаланады.

Репродукция: бір жаңа email-ге сегіз қатар шақыру. Негізгі агенттің қайта орындауында төрт `IntegrityError: UNIQUE constraint failed: users.email` шықты; қалғаны user dict қайтарды. Қате саны scheduler-ге тәуелді.

Түзету: email бойынша атомарлы upsert/insert-on-conflict және кейін re-read. Synthetic `telegram_id` collision-ін email conflict-тен бөлек өңдеу. Бір уақытта келген сұраулар бір user-ді сәтті қайтаруы тиіс.

### A10 · P2 · Guest quiz PIN lookup және join шектелмеген

Код: [quiz_game.py:108](/E:/CursorMathbot/bot/routes/quiz_game.py:108), join — 115-жол; repository insert — [quiz_sessions.py:145](/E:/CursorMathbot/bot/repositories/quiz_sessions.py:145).

Lookup/join supplied limiter-ді қолданбайды, session participant cap жоқ. PIN-ді білетін бір клиент көптеген guest/token құрып, roster/leaderboard пен DB-ді толтыра алады. Алты таңбалы PIN lookup-ты шектеудің болмауы active room іздеуді де жеңілдетеді.

Репродукция: бір клиенттен 120 PIN lookup — барлығы `200`; 120 әртүрлі nickname-мен anonymous join — барлығы `200`; DB-де 120 participant. Join сұраулары anonymous identity-мен trusted proxy signature арқылы жіберілді; account қажет болған жоқ.

Түзету: trusted edge-де клиентке қарай lookup/join limits, session participant cap және host moderation. Backend көретін ортақ proxy IP бойынша ғана шектеу барлық guest-ті бір топқа біріктіреді. Production сыртқы WAF конфигурациясы осы аудитте тексерілген жоқ.

### A11 · P2 · Metrics raw path кілттері шексіз өседі

Код: [metrics_middleware.py:21](/E:/CursorMathbot/bot/middleware/metrics_middleware.py:21), [metrics.py:16](/E:/CursorMathbot/bot/utils/metrics.py:16).

Metrics endpoint кілтіне route template орнына толық URL path жазылады. `events` 10 000 элементпен шектелгенімен, `endpoint_counts` және `error_counts` dict-терінде eviction жоқ. Әртүрлі жарамсыз URL немесе ID-лер әрдайым жаңа тұрақты кілт жасайды; process өмірі бойы жады өседі. Нақты user email path-та болса, ол да telemetry label-ге кіруі мүмкін.

Репродукция: 20 000 әртүрлі `GET /missing-N` 404 event → retained events 10 000, endpoint keys 20 000, error keys 20 000. Бастапқы өлшеуде тек dict/key объектілерінің төменгі бағасы шамамен 3,56 MB болды; бұл production load test емес.

Түзету: request орындалғаннан кейін route template-ті (`/api/.../{id}`) пайдалану, unmatched path-тарды бір label-ге біріктіру; қосымша bounded counters/expiry енгізу.

### A12 · P2 · Frontend dependency security gate өтпейді

Код: [package.json:23](/E:/CursorMathbot/web/package.json:23), PostCSS pin/override — 44/48-жол; нақты орнатылатын нұсқалар `package-lock.json` ішінде; CI gate — [ci.yml:107](/E:/CursorMathbot/.github/workflows/ci.yml:107).

`npm ci` өзгеріссіз lockfile-дан орнатқан соң `npm audit` exit code `1` қайтарды. Толық ағашта 51 affected package entry: **3 critical, 8 high, 37 moderate, 3 low**. `--omit=dev` ағашында 16: **3 critical, 7 high, 4 moderate, 2 low**. Бұл жеке exploit саны емес: бір advisory бірнеше package/effect арқылы саналады; production tree-де build tooling де болуы мүмкін.

Нақты lock нұсқалары: Next `15.5.26`, next-auth `4.24.14`, Sentry `10.58.0`, PostCSS `8.5.14`. CI-дегі `npm audit --audit-level=moderate` осы күйде өтпейді. Python requirements resolver аудиті 62 dependency үшін known vulnerability таппады, бірақ backend lockfile болмағандықтан бұл deployed inventory туралы кепілдік емес.

Ресми advisory-лермен қолданылу шарттары салыстырылды:

- [Next image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): Next `15.5.28` патчын және `sharp >=0.35.5` талабын көрсетеді. Сипатталған RCE glibc Linux/Image Optimization/SVG шарттарына тәуелді. Реподағы Docker image Alpine, ал нақты hosted runtime осы аудитте тексерілмеді; жобада RCE жасалып расталған жоқ.
- [Next Server Actions DoS advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): кемінде бір Server Action қажет. Source іздеуінде `use server` табылған жоқ, сондықтан осы attack path расталмады.
- [Sentry tunnel advisory](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55): `tunnelRoute` пен middleware-only auth сияқты бірнеше шарт бар. Бұл конфигурацияда `tunnelRoute` табылған жоқ. npm severity-і critical болғанымен, maintainer advisory бетінде moderate деп көрсетілген; жобада auth bypass расталмады.
- [Auth.js provider mix-up advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279): multiple providers/account linking қажет; бұл жоба бір Google provider қолданады. [Malformed Bearer advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj) `getToken()` өңдеуіне қатысты; proxy-дің сыртқы catch-і бар, auth bypass дәлелі жоқ. v4 patch ретінде `4.24.15` көрсетілген.

Түзету: қолдау көрсетілетін patched release-терге lockfile-ды саналы түрде жаңарту; PostCSS override-ты да жаңарту; кейін build/typecheck/test/audit қайта орындау. `npm audit fix --force` ұсынған major downgrade-тарды автоматты қолданбау: audit output ішінде eslint/Jest үшін кері major нұсқалар ұсынылған.

### A13 · P3 · Bank rollback text_scale өрісін қалпына келтірмейді

Код: [versions.py:274](/E:/CursorMathbot/bot/repositories/bank/versions.py:274).

Snapshot `text_scale` сақтағанымен, rollback UPDATE SQL және parameter list бұл өрісті қамтымайды. Нәтижесінде таңдалған ескі нұсқаның көрсетілу өлшемі қайтпайды. Егер нұсқалар тек осы өріспен ерекшеленсе, rollback мазмұн өзгерісін де тіркемей қалуы мүмкін.

Репродукция: v1 `sm` → update `lg` → rollback(v1); кейінгі `text_scale` әлі `lg`.

Түзету: rollback қалпына келтіретін өрістерді snapshot schema-мен сәйкестендіру; `text_scale` және өзге presentation fields бойынша schema completeness тексерісін қосу.

## Тексеру нәтижелері

Орта: Windows, Python **3.11.4**, Node **24.11.1**, npm **11.6.2**. Python тәуелділіктері requirements арқылы уақытша virtualenv ішінде толықтырылды; virtualenv қолда бар system packages-ті пайдаланды. Жергілікті жетіспеген `botocore` сол ортаға орнатылды. Frontend `npm ci` арқылы орнатылды. Бұл CI-дегі Python 3.12/PostgreSQL және Node 20 орталарын толық қайталамайды.

| Тексеру | Нәтиже | Журнал |
| --- | --- | --- |
| Backend pytest, барлық testpaths | **419 passed, 5 skipped**, 109,10 с | [backend-tests.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/backend-tests.log) |
| Frontend Jest, 58 suites | **337 passed**, 49,61 с | [frontend-tests.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/frontend-tests.log) |
| Frontend ESLint, max warnings 0 | Exit **0** | [frontend-lint.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/frontend-lint.log) |
| TypeScript noEmit | Exit **0** | [typecheck.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/typecheck.log) |
| Next production build | Exit **0**, 25 static pages generated | [build.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/build.log) |
| Backend flake8 E9/F63/F7/F82, vendor/env excluded | **0** errors | [backend-flake8.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/backend-flake8.log) |
| pip-audit requirements resolution | **0 known**, 62 dependencies | [pip-audit.json](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/pip-audit.json) |
| npm audit full | Exit **1**, 51 affected entries | [npm-audit.json](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/npm-audit.json) |
| npm audit omit dev | Exit **1**, 16 affected entries | [npm-audit-production.json](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/npm-audit-production.json) |
| Frontend ақау репродукциялары | **3 passed**, baseline-нан көшірілген 13 test таңдалмай қалды | [frontend-repros.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/frontend-repros.log) |
| Domain ақау репродукциялары | **5 сценарий расталды**, exit 0 | [domain-repros.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/domain-repros.log) |
| Security ақау репродукциялары | **2 сценарий расталды**, exit 0 | [security-repros.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/security-repros.log) |
| Math және metrics репродукциялары | **2 сценарий расталды**, exit 0 | [runtime-repros.log](/E:/CursorMathbot/docs/audit/2026-11-01/evidence/runtime-repros.log) |

Қосымша агенттің proxy/RBAC/quiz security/middleware нысаналы тексерісінде 70 тест өтті; бұл толық backend нәтижесінің ішкі жиыны, жалпы санға қайта қосылған жоқ. Алғашқы backend collection жетіспеген local dependency салдарынан тоқтады; кестеде талаптар орнатылғаннан кейінгі соңғы нәтиже берілген. Бастапқы flake8 `.` vendor `venv/` ішіне кірген; соңғы тексеріс қолданба source-ын ғана бағалайды.

## Қайта орындау

Репродукциялар **аудит сәтіндегі қате мінез-құлықтың бар екенін assert етеді**. Түзетуден кейін олардың assert failure беруі күтіледі; содан кейін оларды дұрыс мінез-құлықты тексеретін regression test-ке айналдыру қажет. Backend скрипттері production DB-ге қосылмайды; domain скрипті жаңадан құрылған temp artifacts қалдырады, security скрипті өз temp DB-сін тазартады.

```powershell
# bot/requirements.txt орнатылған Python арқылы, workspace түбірінен:
python E:\CursorMathbot\docs\audit\2026-11-01\repros\domain.py E:\CursorMathbot\bot
python E:\CursorMathbot\docs\audit\2026-11-01\repros\security.py E:\CursorMathbot\bot
python E:\CursorMathbot\docs\audit\2026-11-01\repros\runtime.py E:\CursorMathbot\bot

# E:\CursorMathbot\web ішінен:
node node_modules/jest/bin/jest.js --runInBand --watch=false --roots E:/CursorMathbot/docs/audit/2026-11-01/repros --modulePaths E:/CursorMathbot/web/node_modules --testMatch '**/audit_*.tsx' --testPathIgnorePatterns '^$' -t AUDIT
```

## Түзету реті және тексеру шектері

1. **A01–A03:** редактордан дерек жоғалуы мен тарихи суреттің өшірілуін тоқтату; қақтығыс және partial-load сценарийлеріне regression test.
2. **A04–A09:** production pool capacity-мен concurrency тексеру; answer-key access шарттарын бекіту; public option schema, draft flush, constant grading және user upsert.
3. **A10–A12:** guest traffic шектеуін identity/edge контекстімен жобалау; metrics cardinality-ді шектеу; dependency lock/overrides жаңарту және CI security gate-ті қалпына келтіру.
4. **A13:** snapshot/rollback schema parity-ін толықтыру.

Нақты PostgreSQL сервері, Docker runtime, Google OAuth browser flow, S3 credential/storage round trip және production deployment E2E бұл ортада орындалған жоқ. PostgreSQL-ге арналған бес opt-in тест өткізіліп жіберілді; production нагрузкасына capacity кепілдігі берілмейді. Жергілікті build `.env.local` конфигурациясын пайдаланды; оның мәндері есепке көшірілген жоқ.

Архитектуралық келесі тексерістер: Python runtime declaration (`pyproject.toml` 3.12) мен Docker/CI 3.11-ді біріздендіру; backend тәуелділіктерінің қайталанатын lock/inventory тәртібін енгізу; асинхронды cleanup ішіндегі synchronous S3 delete-ті thread/offload-қа шығару; serverless режиміндегі process-local cache/metrics үшін shared invalidation/monitoring қажеттілігін бағалау. Бұлар жеке қайта жасалған exploit ретінде саналмаған.

Proxy/RBAC шекарасынан critical authentication bypass расталған жоқ. Quiz guest token cache leak туралы бастапқы күдік расталмады: quiz API `cache: "no-store"` қолданады. Бұл қорытындылар тек аталған revision мен орындалған тексерістердің шегінде жарамды.
