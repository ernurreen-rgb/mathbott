# Аудиттен кейінгі даму жұмыстары

2026-11-02. Бастапқы A01–A13 аудит түзетулері аяқталған; осы файл келесі даму кезеңін тіркейді. Өзгерістер жеке commit-пен сақталып, origin/main тармағына жіберіледі.

| ID | Жұмыс | Күйі |
| --- | --- | --- |
| D01 | Docker workflow-дағы жарамсыз Trivy action сілтемесі | Түзетілді; толық Docker run өтті |
| D02 | CI, Docker және development ортасын Node 24-ке көшіру | Түзетілді; жергілікті және GitHub CI өтті |
| D03 | Production migration/release және қалпына келтіру тексерістері | Deploy және production PostgreSQL snapshot restore өтті; S3 бөлек |
| D04 | Негізгі браузер сценарийлеріне E2E | Квиз + trial draft: 16 Windows/Linux E2E және толық CI өтті; нақты OAuth бөлек |
| D05 | Тақырыптық прогресс және қатемен жұмыс кезегі | Жоспарланған |
| D06 | Backend image ішіндегі setuptools vendored осалдықтары | Түзетілді; container scan/push өтті |
| D07 | Production web image ішіндегі npm vendored осалдықтары | Түзетілді; startup және container scan/push өтті |
| D08 | Sentry build token-ін secret mount арқылы беру | Түзетілді; нақты build/scan/push өтті |

## D01

Соңғы [Docker run](https://github.com/ernurreen-rgb/mathbott/actions/runs/41337046615) `aquasecurity/trivy-action@0.28.0` нұсқасын таба алмай, action preparation кезеңінде тоқтаған. Екі scan step ресми [v0.36.0 release](https://github.com/aquasecurity/trivy-action/releases/tag/v0.36.0) commit-іне бекітілді: `ed142fd0673e97e23eac54620cfb913e5ce36c25`.

Release tag/SHA және action input contract upstream GitHub API/manifest арқылы тексерілді. Image reference, HIGH/CRITICAL gate, exit-code=1 және scan-before-push реті сақталды. Жергілікті Docker engine қолжетімсіз; image build/scan/push нәтижесі GitHub Actions арқылы тексеріледі.

`654a2a3` commit-інің [Docker run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41391193402) action preparation, backend/frontend tests, Docker Hub login және backend image build кезеңдерінен өтті. Backend scan енді нақты екі HIGH finding тапты: setuptools ішіндегі jaraco.context 5.3.0 (CVE-2026-23949) және wheel 0.45.1 (CVE-2026-24049). Image publication gate дұрыс тоқтатты; бұл D06 ретінде бөлек түзетіледі.

## D02

Root `.nvmrc` Node 24 тармағын таңдайды; төрт GitHub setup-node step сол файлды оқиды. Production/development web Docker image-тері `node:24-alpine` қолданады. `web/package.json` ішіндегі `engines.node=24.x` Vercel build/function runtime-ына да қолданылады ([provider contract](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)). Node 24 [ресми LTS тармағы](https://nodejs.org/en/about/previous-releases), Node 20 EOL күйінде.

Node types 24.19.2 және undici-types 7.24.6 жаңартылды; басқа dependency version-дар өзгерген жоқ. `install-links=false` және private matcher adapter сақталды. Release нұсқаулығына local/CI/Docker/Vercel runtime таңдауы енгізілді.

Тексеру таза source export-та Node **24.22.2 / npm 11.6.2** арқылы орындалды:

- Full және production-only `npm ci --engine-strict`: **exit 0**; бұрынғы compute-engine Node engine warning-і жоқ — [full install](evidence/D02/ci.log), [production install](evidence/D02/production.log).
- **61 Jest suite / 388 test**, coverage-пен; pretest ішіндегі **6 dependency integration test** өтті — [журнал](evidence/D02/tests.log).
- Production build, TypeScript және zero-warning ESLint: **exit 0** — [build](evidence/D02/build.log), [typecheck](evidence/D02/typecheck.log), [lint](evidence/D02/lint.log).
- `npm audit --audit-level=moderate`: **exit 0**, 5 low development entry сақталды; production audit — **0 affected entry** — [full audit](evidence/D02/audit.json), [production audit](evidence/D02/audit-production.json).
- `npm ls --all`: **exit 0**. Production install-да Next, NextAuth, Sentry config және sharp native module сәтті жүктелді.

Жергілікті Docker engine жоқ; нақты Linux container scan/push GitHub Actions арқылы D07/D08 нәтижелерінде расталды. D02-де backend source/requirements өзгертілген жоқ, local backend suite қайталанбады.

## D06

Backend image-тің Trivy scan-ы application requirements-тен бөлек, Python base image ішіндегі setuptools vendor metadata-сынан екі HIGH осалдық тапты — [бастапқы findings](evidence/D06/scan-before.log). Runtime stage енді installed application packages көшірілгеннен кейін `setuptools==80.10.2` орнатады. Сол рет pip uninstall арқылы ескі vendor файлдары мен metadata-сын да алып тастайды; COPY overlay арқылы жаңа файлды үстінен көшіру қолданылған жоқ.

Ресми PyPI wheel archive-і және бөлек таза Python 3.11 virtualenv тексерісі pinned setuptools ішінде **jaraco.context 6.1.0 / wheel 0.46.3** барын растады. Ескі 5.3.0 / 0.45.1 metadata жоқ; setuptools import және `pip check` өтті — [журнал](evidence/D06/packaging.log). Scanner threshold және ignore policy өзгермеді. Нақты Linux container scan/push D07/D08 run-дарында өтті.

## D03: production-ды тек оқу арқылы тексеру

Vercel-дегі linked `qazmath-api` production environment мәндері ephemeral process арқылы алынды. PostgreSQL session ішінде `SET TRANSACTION READ ONLY` қолданылды; тек migration metadata және table existence оқылды. Жергілікті development `.env.local` production мәндерін алмастырмауы үшін CLI бөлек project-link fixture-ден орындалды. Secret мәндер журналға немесе repo-ға жазылмады.

- PostgreSQL `0001_initial`–`0006_quiz_entry_limits` миграцияларының бәрі қолданылған; missing migration және local SQL checksum mismatch **жоқ**.
- A10 `quiz_entry_limits` кестесі **бар**. Қайта migration apply жасау қажет емес.
- Linked web project's production `BACKEND_URL` арқылы API health: **HTTP 200, healthy, database ok**.

[Тексеру нәтижесі](evidence/D03/production-readiness.json). Бұл қадамда production DB schema/data өзгертілмеді және deployment орындалмады. Backup restore drill, staging-де authenticated/browser scenario-лар және толық release rehearsal келесі жұмыс болып қалады.

## D07

`231abc9` [Docker run](https://github.com/ernurreen-rgb/mathbott/actions/runs/41392089016) backend image build/scan кезеңдерінен өтті. Frontend scan production app packages-тен емес, `/usr/local/lib/node_modules/npm/node_modules/` ішінен 6 HIGH finding тапты: brace-expansion 5.0.9 үшін екі және undici 6.28.0 үшін төрт CVE — [бастапқы findings](evidence/D07/scan-before.log).

Production image locked app dependencies орнатылғаннан кейін қолданылмайтын global npm/npx-ті алып тастайды. Next.js бұрынғы host/port параметрлерімен тікелей Node арқылы басталады; package.json start script, development және builder installer-лері өзгерген жоқ. Scanner exception немесе threshold әлсірету қосылмады.

Node 24.22.2-де production-only dependencies + нақты `.next` build арқылы direct startup тексерілді. Child process PATH ішінде npm жоқ: root page **HTTP 200**, Auth providers endpoint **HTTP 200 / Google provider**. Server test соңында тоқтатылды — [startup log](evidence/D07/runtime-smoke.log). Нақты Linux image scan/push төмендегі run-дарда расталды.

`0575de1` revision-ында [толық CI](https://github.com/ernurreen-rgb/mathbott/actions/runs/41393767740) және [Docker run](https://github.com/ernurreen-rgb/mathbott/actions/runs/41393767746) сәтті аяқталды. Екі image-тің configured HIGH/CRITICAL gate-тері өтті; backend және frontend Docker Hub-қа `latest` және commit SHA tag-терімен жарияланды — [CI evidence](evidence/D07/ci-remote.json), [release evidence](evidence/D07/release-remote.json). Бұл Docker Hub publication; production application deploy бұл тексерісте орындалған жоқ.

## D08

Сәтті Docker run annotation-ы `ARG SENTRY_AUTH_TOKEN` үшін `SecretsUsedInArgOrEnv` ескертуін шығарды. Token transport [Docker ұсынған secret mount](https://docs.docker.com/build/building/secrets/) үлгісіне ауыстырылды: GitHub build-push step `secrets` input береді, ал жалғыз build RUN instruction оны ephemeral environment ретінде алады. Token Dockerfile ARG/ENV және build-args тізімінен алынды.

Workflow YAML және secret ID/environment wiring тексерілді. Secret берілмеген local build бұрынғыдай source-map upload-сыз орындала алады; local build нұсқаулығы жаңартылды.

`a2726e4` revision-ының [CI run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41394998899) және [Docker run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41394998861) **success**. Нақты BuildKit frontend build, екі image scan және екі Docker Hub push өтті. Build журналында `SecretsUsedInArgOrEnv` ескертуі жоқ — [CI evidence](evidence/D08/ci-remote.json), [release evidence](evidence/D08/release-remote.json), [transport verification](evidence/D08/verification.json).

Осы run token орнатылмаған кезде бос `sentry_auth_token=` input үшін action warning шығаратынын көрсетті. Follow-up expression secret input-ті тек token бар кезде береді; Dockerfile mount optional болып қалады. Dockerfile/application source өзгермеді, conditional wiring YAML арқылы тексерілді.

Алғашқы инфрақұрылым кезеңі D01/D02/D06/D07/D08 бойынша аяқталды. Production migration/health read-only тексерістері өтті; келесі кезең — restore drill және staging/browser E2E. Тақырыптық прогресс пен қатемен жұмыс D05 ретінде жоспарланған.

## Production deploy

Пайдаланушының production deploy сұрауы бойынша `a30708a` коды API → web ретімен жарияланды. Екі deployment READY, негізгі домендер жаңа ID-лерге бағытталған. Health/Auth/catalogue/proxy/static asset smoke checks өтті; sensitive secret мәндері ауыстырылмады. Толық [release есебі](../../deployments/2026-11-02/production-a30708a.md) және оның JSON нәтижесі rollback deployment ID-лері мен тексеру шектеулерін сақтайды.

## D04: квизге қосылу және нәтижеге жету

`web/e2e/` ішіне Playwright 1.64.1 браузерлік regression suite қосылды. Төрт
сценарий desktop Chromium және Pixel 7 өлшемінде орындалады — барлығы 8 тест:

- Қате PIN, бос есім және жоқ ойын кезіндегі UI/API validation.
- Private квиздің source/catalogue visibility шектеулері; PIN → lobby → host
  start → дұрыс/қате жауап → reload → 50% нәтиже → жеке review.
- Сервер жауапты сақтағаннан кейін HTTP acknowledgement жоғалса, polling арқылы
  қалпына келу; бір payload-ты қайта жіберу ұпай мен жауап санын арттырмайды.
- Серверге жетпеген жауапты UI retry арқылы жіберу; reload нәтижені сақтайды.

API production auth/CSRF режимінде, бөлек уақытша SQLite базасында жұмыс істейді.
Web таза уақытша source copy-дан production build жасайды; `.env*`, `.vercel`
және дайын build көшірілмейді. Child process ортасына тек OS essentials пен
synthetic test configuration беріледі. URL-дер loopback-ке бекітілген және
бұрын іске қосылған server қайта қолданылмайды. Application auth bypass немесе
reset/seed HTTP endpoint қосылған жоқ.

Мұғалімнің тесттік cookie-і NextAuth-тың қалыпты JWT encryption механизмімен
жасалады. Бұл signed authenticated proxy flow-ды тексереді; нақты Google OAuth
exchange-ті тексермейді. Guest join/answers/result/review браузер UI арқылы өтеді.
Production деректері мен deploy өзгермейді. Қазір provision жасалған сыртқы
staging ортасы жоқ: бұл local/CI ортасындағы оқшауланған release check.

GitHub CI-ге `browser-e2e` job қосылды: Python 3.12, Node 24, Chromium, бөлек
fixture server-лер және 7 күн сақталатын HTML report/failure trace artifact-тері.
Jest, ESLint және Docker context generated E2E output-ты елемейді. Іске қосу
нұсқаулығы мен шектеулер: [web/e2e/README.md](../../../web/e2e/README.md).

Жергілікті Node 24.22.2 / Python 3.11 тексерістері: **8/8 Chromium E2E**,
**61 Jest suite / 388 test**, **6 dependency integration test**, production
build, TypeScript және zero-warning ESLint өтті. Нәтиже экрандарының desktop
және mobile скриншоттары визуалды тексерілді. `npm audit --audit-level=moderate`
exit 0; бұрын тіркелген 5 low development entry сақталды, жаңа advisory жоқ.
GitHub Linux/Python 3.12 нәтижелері төменде тіркелген.

Runtime graph тексерісі Next-тің optional `@playwright/test` peer-і wrapper-ді
production dependency ретінде де есептейтінін көрсетті. Follow-up сол runner-ді
ресми `playwright/test` export-ынан импорттайды; direct `playwright` және
`playwright-core` lockfile-де тек `dev: true`, wrapper package жоқ. Бөлек таза
`npm ci --omit=dev --engine-strict` exit 0: үшеуі де production node_modules
ішінде жоқ, production audit **0 affected package**.

`f196dad` revision-ының алғашқы [CI run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41427125981)
толық **success**: SQLite/backend, PostgreSQL/backend, frontend, security және
жаңа browser-e2e job-тары өтті. Linux/Python 3.12-де **8/8 E2E**, HTML report
artifact-і сақталды.

Runtime graph өзгерісінен кейін clean full install, TypeScript, ESLint және
**8/8 E2E** қайта өтті; test runner behavior сақталған.

Соңғы functional revision `550e57e` үшін [толық CI](https://github.com/ernurreen-rgb/mathbott/actions/runs/41428688329)
**success**: бес job-тың бәрі өтті. Linux/Python 3.12 browser job-ында **8/8 E2E**,
`browser-e2e-report` artifact ID `13133726139` (7 күн retention). Runtime/tooling
және local/remote нәтижелердің [verification JSON-ы](evidence/D04/verification.json)
сақталды. Бұл кезең production deployment жасамайды.

Нақты Google sign-in/staging rehearsal D04-тің бөлек тексерісі болып қалады.
Trial-test draft және PostgreSQL restore нәтижелері төмендегі бөлімдерде тіркелді.
D05 тақырыптық прогресс/қатемен жұмыс кезегі осы тексерістерден кейін жалғасады.

## D03: production PostgreSQL snapshot restore

`bot/scripts/postgres_backup.py` direct source URL-ді тек арнайы environment
variable-ден алады; dotenv және application `DATABASE_URL` fallback қолданбайды.
Source transaction **REPEATABLE READ / READ ONLY** режимінде snapshot экспорттайды.
Manifest пен custom-format `pg_dump` бір snapshot пайдаланады, сондықтан қатар
жазулар restore checksum-дарын бұзбайды. Құпия URL/password argv/log-қа шықпайды.

Restore default-ы — read-only plan. `--apply` тек `mathbot_restore_*` аталған
бөлек, бос database-ке рұқсат береді; бар кесте бос болса да операция тоқтайды.
Archive SHA-256 тексерілгеннен кейін `pg_restore --single-transaction
--exit-on-error` орындалады. Overwrite/drop/create-database command жоқ.
Кейін table row count/content digest, schema definitions, алты migration
checksum және ID sequence позициялары салыстырылады. Dropped column физикалық
slot аралықтары логикалық баған ретімен нормализацияланды.

Vercel-linked production Neon source **PostgreSQL 18.6** екені read-only query
арқылы расталды. Ресми EDB 18.6 clients/server таза жеке fixture-ге дайындалды.
Production snapshot authenticated, loopback-only PostgreSQL 18.6-дегі жаңа
database-ке restore жасалды:

- **44 кесте / 2 155 жол**; барлық schema/content/migration checksum сәйкес.
- **38 sequence** тексерілді; users identity insert тек restore target-те
  орындалып, row insert rollback жасалды.
- Snapshot/export → restore → verification: **70.33 секунд**, archive **206 386
  byte**. Production write, deployment немесе traffic switch орындалмады.
- Backup және restored data Git-тен тыс ACL-restricted жеке directory-де.
  Source URL/password backup manifest-інде жоқ; repo-ға тек sanitized evidence
  сақталады. `backups/` және `*.dump` gitignored.

Жергілікті PostgreSQL 18.6-де **6/6 regression test** өтті: real restore,
Unicode/quiz answer/identity, concurrent source write кезінде бір snapshot,
бұзылған архив, populated/empty-existing target-ті қабылдамау, preflight-тен
кейінгі conflict кезінде restore DDL/data rollback. CI-ге PostgreSQL 18 /
Python 3.12 `postgres-restore-drill` job қосылды; тек synthetic test report
artifact-і жарияланады, production archive CI-ге жіберілмейді.

Толық [runbook](../../../deploy/POSTGRES_BACKUP_RESTORE.md) және
[production restore evidence](evidence/D03/production-restore.json).
S3 image bytes, roles/ACL, provider PITR, scheduled/off-site retention бұл
logical public-schema drill-ға кірмейді. Нақты Google OAuth бөлек тексеріледі;
trial-test draft browser нәтижелері төменде тіркелген.

`0f2c6b3` revision-ының [толық CI run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41432305249)
**success**: барлық **6 job** өтті. Жаңа PostgreSQL 18 / Python 3.12 job-ында
**6/6 restore test** өтті, synthetic JUnit artifact сақталды. [Docker run](https://github.com/ernurreen-rgb/mathbott/actions/runs/41432305382)
да **success**: build, configured image scan gate-тері және push өтті.
[Remote CI evidence](evidence/D03/restore-ci.json). Нақты production snapshot
GitHub-қа немесе CI artifact-іне жіберілген жоқ.

## D04: trial-test draft lifecycle E2E

`web/e2e/trial-draft.spec.ts` төрт жаңа сценарийді desktop Chromium және Pixel 7
өлшемінде тексереді. Жалпы suite — **16 тест** (8 quiz + 8 trial):

- Нақты choice және MathLive keyboard input autosave; жауаптар мен current task
  index reload-тан кейін қалпына келеді. Екі learner draft-ы бөлек; query/body
  email басқа аккаунтты көрсетсе де, signed identity қолданылады.
- Debounce timer Playwright clock-пен кідіртіліп, Next Link арқылы SPA departure
  және нақты tab close орындалады. Autosave іске қосылмай тұрып соңғы жауап
  серверге жетіп, қайта ашылған tab-та қалпына келеді.
- Draft GET transport failure кезінде бос жауаптар серверге жазылмайды; cleanup
  сақталған draft-ты өшірмейді. Желі қалпына келгенде сол жауап қайта жүктеледі.
- Submit серверде сақталып, acknowledgement жоғалса, сол attempt табылып нәтиже
  ашылады. Replay екінші result құрмайды; draft бос, retake бұрынғы жауапсыз ашылады.

Fixture-ге admin және екі learner қосылды. Teacher/learner admin болмайды;
trial test/slot normal signed admin API арқылы жасалады. Account cookie-лері
fixture secret-пен стандарт NextAuth JWT encryption арқылы беріледі. Application
auth/config өзгермейді, Google OAuth exchange бұл suite-те тексерілмейді.

Жергілікті алғашқы run: **16/16 E2E**, **61 Jest suite / 388 test**, **6 dependency
integration test**, TypeScript және zero-warning ESLint өтті. Нәтиже экрандарының
скриншоттары қаралды. Desktop result screenshot алдында sidebar/workspace
геометриясы тексеріліп, layout transition бітуі күтіледі; осы қосымша assert бар
desktop result сценарийі жеке қайта өтті.
Production деректері мен deployment өзгермейді. Іске қосу және scope:
[web/e2e/README.md](../../../web/e2e/README.md).

`81a41e3` revision-ының [толық CI run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41435918009)
**success**: барлық **6 job** өтті. Linux/Python 3.12 browser job-ы **16/16 E2E**
орындады; жаңа 8 trial draft test пен бұрынғы 8 quiz test бірге өтті. HTML report
artifact ID `13136103453`, retention 7 күн. Local/remote тексерістердің
[verification JSON-ы](evidence/D04/trial-draft-verification.json) сақталды.
