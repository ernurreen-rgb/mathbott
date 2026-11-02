# Аудиттен кейінгі даму жұмыстары

2026-11-02. Бастапқы A01–A13 аудит түзетулері аяқталған; осы файл келесі даму кезеңін тіркейді. Өзгерістер жеке commit-пен сақталып, origin/main тармағына жіберіледі.

| ID | Жұмыс | Күйі |
| --- | --- | --- |
| D01 | Docker workflow-дағы жарамсыз Trivy action сілтемесі | Түзетілді; толық Docker run өтті |
| D02 | CI, Docker және development ортасын Node 24-ке көшіру | Түзетілді; жергілікті және GitHub CI өтті |
| D03 | Production migration/release және қалпына келтіру тексерістері | Migration/health өтті; restore/E2E жоспарланған |
| D04 | Негізгі браузер сценарийлеріне E2E | Жоспарланған |
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
