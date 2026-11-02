# Аудиттен кейінгі даму жұмыстары

2026-11-02. Бастапқы A01–A13 аудит түзетулері аяқталған; осы файл келесі даму кезеңін тіркейді. Өзгерістер жеке commit-пен сақталып, origin/main тармағына жіберіледі.

| ID | Жұмыс | Күйі |
| --- | --- | --- |
| D01 | Docker workflow-дағы жарамсыз Trivy action сілтемесі | Түзетілді; GitHub run нәтижесі күтіледі |
| D02 | CI, Docker және development ортасын Node 24-ке көшіру | Келесі |
| D03 | Production migration/release және қалпына келтіру тексерістері | Жоспарланған |
| D04 | Негізгі браузер сценарийлеріне E2E | Жоспарланған |
| D05 | Тақырыптық прогресс және қатемен жұмыс кезегі | Жоспарланған |

## D01

Соңғы [Docker run](https://github.com/ernurreen-rgb/mathbott/actions/runs/41337046615) `aquasecurity/trivy-action@0.28.0` нұсқасын таба алмай, action preparation кезеңінде тоқтаған. Екі scan step ресми [v0.36.0 release](https://github.com/aquasecurity/trivy-action/releases/tag/v0.36.0) commit-іне бекітілді: `ed142fd0673e97e23eac54620cfb913e5ce36c25`.

Release tag/SHA және action input contract upstream GitHub API/manifest арқылы тексерілді. Image reference, HIGH/CRITICAL gate, exit-code=1 және scan-before-push реті сақталды. Жергілікті Docker engine қолжетімсіз; image build/scan/push нәтижесі GitHub Actions арқылы тексеріледі.
