# Changelog

## [0.7.1](https://github.com/BTRC-Solutions/careerly/compare/v0.7.0...v0.7.1) (2026-11-21)


### Features

* add a privacy screen and keep user data out of the logs (F8.4) ([#98](https://github.com/BTRC-Solutions/careerly/issues/98)) ([140e416](https://github.com/BTRC-Solutions/careerly/commit/140e4168bce356f788396b411727ab4baae069c3))
* add applications dashboard to the home screen ([#94](https://github.com/BTRC-Solutions/careerly/issues/94)) ([ce08925](https://github.com/BTRC-Solutions/careerly/commit/ce089252d7d7ab8d8bdc2c1c51a4326e1bc7d310))
* add the privacy screen and keep query parameters out of the logs ([140e416](https://github.com/BTRC-Solutions/careerly/commit/140e4168bce356f788396b411727ab4baae069c3))
* check accessibility with axe and fix the tool picker combobox ([#96](https://github.com/BTRC-Solutions/careerly/issues/96)) ([231805f](https://github.com/BTRC-Solutions/careerly/commit/231805ff1be57b0016921d6cb7bf80b5c959dc43))
* **stats-web:** add the public statistics page ([abbec03](https://github.com/BTRC-Solutions/careerly/commit/abbec03f62e2da99fec5fc450fef41d694fac3e5))
* **stats-web:** add the public statistics page (F8.6) ([#104](https://github.com/BTRC-Solutions/careerly/issues/104)) ([abbec03](https://github.com/BTRC-Solutions/careerly/commit/abbec03f62e2da99fec5fc450fef41d694fac3e5))
* **telemetry-api:** add the telemetry receiver ([48ebfa3](https://github.com/BTRC-Solutions/careerly/commit/48ebfa3349a3b23e123cf7ecf7370f6f063d5f1f))
* **telemetry-api:** add the telemetry receiver (F8.5) ([#103](https://github.com/BTRC-Solutions/careerly/issues/103)) ([48ebfa3](https://github.com/BTRC-Solutions/careerly/commit/48ebfa3349a3b23e123cf7ecf7370f6f063d5f1f))
* **telemetry:** drop impossible values and unknown countries from reports ([#99](https://github.com/BTRC-Solutions/careerly/issues/99)) ([b483352](https://github.com/BTRC-Solutions/careerly/commit/b483352f0f0bea8a544564a94be3a8b4ce1621f5))

## [0.7.0](https://github.com/BTRC-Solutions/careerly/compare/v0.6.0...v0.7.0) (2026-11-19)


### Features

* add contacts and extra data to job applications ([85d53c2](https://github.com/BTRC-Solutions/careerly/commit/85d53c2151c3139bccf57ba065662befb1b561d1))
* add the append-only timeline of job applications ([445390c](https://github.com/BTRC-Solutions/careerly/commit/445390cfbbf205245c38a8404874adca818f8af3))
* add the application aggregate and its state machine ([fe41dd5](https://github.com/BTRC-Solutions/careerly/commit/fe41dd566e872456e3d557e4bb1c717791eb94c1))
* add the applications board and table ([99c4271](https://github.com/BTRC-Solutions/careerly/commit/99c4271584b7a8f0d3f4394ae1be8bf5d144875f))
* create job applications and record the finalized CVs sent ([8cbbea3](https://github.com/BTRC-Solutions/careerly/commit/8cbbea3a8876ba772863d98c2efa668e10d4815f))
* finalize tailoring sessions into immutable resume versions ([c167eb6](https://github.com/BTRC-Solutions/careerly/commit/c167eb6e1e3c410ed320b2e0de0ca375bb0917ca))
* **telemetry:** report the metrics of job applications ([1ef0f4a](https://github.com/BTRC-Solutions/careerly/commit/1ef0f4a1aadea895d25f1bb9d28098e840e3b64d))


### Miscellaneous Chores

* close phase 7 ([860f4a3](https://github.com/BTRC-Solutions/careerly/commit/860f4a314a563f8d797f350d4b56f9126b65889a))

## [0.6.0](https://github.com/BTRC-Solutions/careerly/compare/v0.5.0...v0.6.0) (2026-11-19)


### Features

* **api:** add the truthfulness guard to tailored CVs (F6.4) ([ae82227](https://github.com/BTRC-Solutions/careerly/commit/ae822270d78fb9610111d576127782fdd6798133))
* **api:** fit tailored CVs to the page budget when generating (F6.5) ([af21a0a](https://github.com/BTRC-Solutions/careerly/commit/af21a0ab6d4d60ec117318b75ae3987347975694))
* **api:** write tailored CVs per language with sources (F6.3) ([11e7792](https://github.com/BTRC-Solutions/careerly/commit/11e77926c31c798cb98b9a8c9c4f6d3aa59f40b3))
* regenerate a tailored CV or one section with indications ([10ce888](https://github.com/BTRC-Solutions/careerly/commit/10ce8889d7427d01d4c0f761d472fe16edaacc0f))
* regenerate a tailored CV or one section with indications (F6.7) ([b229de1](https://github.com/BTRC-Solutions/careerly/commit/b229de1ba565515e9ff99c21da24754957f53199))
* review tailored CVs with live preview and edits (F6.6) ([0b2d86e](https://github.com/BTRC-Solutions/careerly/commit/0b2d86ea63ef7d29be13e493318c29d64a338936))
* **tailoring:** choose the languages, page limit and template of a session (F6.1) ([d4e8abf](https://github.com/BTRC-Solutions/careerly/commit/d4e8abf4883fdd1029d0562a398148cc886467d2))
* **tailoring:** resume sessions in progress, or abandon them (F6.8) ([27a87d2](https://github.com/BTRC-Solutions/careerly/commit/27a87d2d8e67d882c85daebc76c89c112f0f58d9))
* **tailoring:** resume sessions in progress, or abandon them (F6.8) ([87092ea](https://github.com/BTRC-Solutions/careerly/commit/87092eacb19dae82656b899320fabb9be2a01a4f))
* **tailoring:** score the relevance of achievements and projects for the job (F6.2) ([f62e47d](https://github.com/BTRC-Solutions/careerly/commit/f62e47da665a8c457a6876af99cc918685d0867d))
* **telemetry:** report generated CVs, their languages and answered gaps (F6.9) ([fdbd467](https://github.com/BTRC-Solutions/careerly/commit/fdbd467b34d7ad89d3a6f0e00a523499ff799400))
* **telemetry:** report generated CVs, their languages and answered gaps (F6.9) ([a6ded83](https://github.com/BTRC-Solutions/careerly/commit/a6ded835fa590ea21d6fcc29de3c5d30428ffd59))


### Miscellaneous Chores

* close phase 6 ([03856cb](https://github.com/BTRC-Solutions/careerly/commit/03856cb0bed4a01c20e703994266823ffcc15268))

## [0.5.0](https://github.com/BTRC-Solutions/careerly/compare/v0.4.0...v0.5.0) (2026-11-18)


### Features

* **api:** add TailoringSession aggregate and state machine ([9f1733f](https://github.com/BTRC-Solutions/careerly/commit/9f1733f82c0eaab7d389fab1bbd6869a95a3dcd1))
* **api:** match job requirements against the master profile ([3fa2966](https://github.com/BTRC-Solutions/careerly/commit/3fa2966b538c890d23c34d286f37443bc90226df))
* **tailoring:** add affirmative gap answers to the profile and the match (F5.6) ([b142f01](https://github.com/BTRC-Solutions/careerly/commit/b142f016c3cdcc70e478af2285067b8ccc24eef0))
* **tailoring:** answer the gap questions in any order, or skip them (F5.5) ([e0bb22c](https://github.com/BTRC-Solutions/careerly/commit/e0bb22ceec9132e7ab24b6e4e21ff90aaa5e4d0c))
* **tailoring:** build the gap questions of a session from its match (F5.4) ([5b38766](https://github.com/BTRC-Solutions/careerly/commit/5b38766f480b87801f46d5b1ff4c66887167cb2f))
* **tailoring:** undo a session's changes to the master profile (F5.7) ([481fce5](https://github.com/BTRC-Solutions/careerly/commit/481fce58da03af65abb9226571d35fec5c9af283))
* **web:** show the match summary of a tailoring session ([88257d8](https://github.com/BTRC-Solutions/careerly/commit/88257d842bb86c2ead9cdb13a2eefa450e9e25f5))


### Miscellaneous Chores

* close phase 5 ([c5ffa93](https://github.com/BTRC-Solutions/careerly/commit/c5ffa9360a85c669cf24b93299f39843bd46beb9))

## [0.4.0](https://github.com/BTRC-Solutions/careerly/compare/v0.3.0...v0.4.0) (2026-11-17)


### Features

* **ai:** AI usage screen and AI actions disabled when unavailable (F4.2) ([f6b4cfe](https://github.com/BTRC-Solutions/careerly/commit/f6b4cfebf33f0078687079a7cd43964d9dd89086))
* **api:** user CV templates (roadmap 4.12) ([f41260e](https://github.com/BTRC-Solutions/careerly/commit/f41260eeb292684415b8eda1060ab5296d12070f))
* **evals:** first AI eval set for the job description analysis (F4.7) ([be76462](https://github.com/BTRC-Solutions/careerly/commit/be76462b3cd3989e0cd4509891a6ae8cff5a661f))
* **job-postings:** AI analysis of job descriptions in the background (F4.5) ([c45427a](https://github.com/BTRC-Solutions/careerly/commit/c45427acdec67d41fdf8542e79a8752fe5f26f2e))
* **job-postings:** create, list, edit and delete job descriptions (F4.4) ([5d3fefc](https://github.com/BTRC-Solutions/careerly/commit/5d3fefc2dcd389e2d5f98e34d11b92091e48add6))
* **job-postings:** review and correct the job description analysis (F4.6) ([d45e76a](https://github.com/BTRC-Solutions/careerly/commit/d45e76a5ce1babc432ca29aaa7913a4eb91cbf2d))
* **jobs:** persisted background job queue with retries and resumption (F4.3) ([2de3e96](https://github.com/BTRC-Solutions/careerly/commit/2de3e96dd24821b34f8eeceac80f24efb474851e))
* **profile:** AI wording suggestions for achievements (F4.8) ([aa55497](https://github.com/BTRC-Solutions/careerly/commit/aa55497f179d7fa8ed4d6f1d871174e1b0675016))
* **telemetry:** AI tokens per day in the "uso de funciones" metric (F4.9) ([b9579de](https://github.com/BTRC-Solutions/careerly/commit/b9579deae82bc1d533e22427b425ca16389c30c4))
* **web:** CV templates screen (roadmap 4.13) ([7cd8675](https://github.com/BTRC-Solutions/careerly/commit/7cd867571cf23f7de47458d01d85640a5265ef0f))


### Bug Fixes

* **api:** strip the render folder from Typst errors on Windows runners ([a567dd9](https://github.com/BTRC-Solutions/careerly/commit/a567dd9faf087f0b90681735d643137f1a973339))


### Miscellaneous Chores

* close phase 4 ([4327319](https://github.com/BTRC-Solutions/careerly/commit/4327319f9a4f62b507e37a11a1bfd184e00a793a))

## [0.3.0](https://github.com/BTRC-Solutions/careerly/compare/v0.2.0...v0.3.0) (2026-11-17)


### Features

* **ai:** Claude as an AI provider with the user's API key (ADR-23) ([84bd526](https://github.com/BTRC-Solutions/careerly/commit/84bd526d77fd4020da053f6ffe915829b55a8b09))
* **ai:** use Claude through Claude Code with the user's subscription (RF-CONF-14, ADR-24) ([e4a0e8d](https://github.com/BTRC-Solutions/careerly/commit/e4a0e8ddf3e53e6c5b0f553e090384760d5aa3f3))
* **api:** manual page-fit tryout script (F3.6) ([b86e26a](https://github.com/BTRC-Solutions/careerly/commit/b86e26ad62fbd8086d834ee5a16a52e579d33b8e))
* **api:** manual page-fit tryout script (F3.6) ([8aea83f](https://github.com/BTRC-Solutions/careerly/commit/8aea83f5102701e6112fee8494730395ee2f2f52))
* Careerly logo and app icons ([8875d54](https://github.com/BTRC-Solutions/careerly/commit/8875d542d182d437b48aceec8dbd397df60965c6))
* Careerly logo and app icons ([91ca8cf](https://github.com/BTRC-Solutions/careerly/commit/91ca8cfd0a35b92cb4c948fb7000dc03594be9fb))
* Claude as an AI provider, with an API key or the user's subscription (F4.11) ([eb67108](https://github.com/BTRC-Solutions/careerly/commit/eb671081d1440ed750e5574c7fbc0423256c1061))
* **desktop:** bundle the pinned Typst CLI in the installer (F3.2) ([fd49ce0](https://github.com/BTRC-Solutions/careerly/commit/fd49ce08b9b284df375f1608201a72e5732f01d5))
* **desktop:** bundle the pinned Typst CLI in the installer (F3.2) ([1e27fb6](https://github.com/BTRC-Solutions/careerly/commit/1e27fb6563dfbf6d9664fe0217624b48adfbfce8))
* **documents:** count rendered pages from the PDF (F3.4) ([d198b92](https://github.com/BTRC-Solutions/careerly/commit/d198b92e28a1a743f74c54e87308bc03911c49a0))
* **documents:** count rendered pages from the PDF (F3.4) ([0092f1c](https://github.com/BTRC-Solutions/careerly/commit/0092f1c249d4c74ce9f6e7ab5f807b951e9c41b6))
* **documents:** ResumeRenderer port with a Typst adapter (F3.3) ([2455ae7](https://github.com/BTRC-Solutions/careerly/commit/2455ae73161fbadc31f01d6da44a96af292f0067))
* **documents:** ResumeRenderer port with a Typst adapter (F3.3) ([1be09fd](https://github.com/BTRC-Solutions/careerly/commit/1be09fd7a7395c2ce9d6cb10c9d018bae7c93efa))
* **documents:** template contract and classic Typst template (F3.1) ([a730bdf](https://github.com/BTRC-Solutions/careerly/commit/a730bdfac09ebc3d26521ec8e369f879c2a27c4c))
* **documents:** template contract and classic Typst template (F3.1) ([eb16900](https://github.com/BTRC-Solutions/careerly/commit/eb16900266e63aa5b540de38b0f03413b3b840ce))
* **tailoring:** deterministic page fitter (F3.5) ([cd61769](https://github.com/BTRC-Solutions/careerly/commit/cd61769cf0498698f45c505b13b3d89636f5649f))
* **tailoring:** deterministic page fitter (F3.5) ([5677b9b](https://github.com/BTRC-Solutions/careerly/commit/5677b9bee51bdd7bb8b34ce262d64e6a4d3f68ad))
* **web:** turn on Claude with the subscription from Settings (F4.11) ([9faef51](https://github.com/BTRC-Solutions/careerly/commit/9faef51eec394b64082911222a836a58dd9093ca))


### Bug Fixes

* **web:** let the CV import run with Claude Code and no API key ([5b0f525](https://github.com/BTRC-Solutions/careerly/commit/5b0f5259ecb91f79b9403bad6f2aa0177fbffc7c))


### Miscellaneous Chores

* close phase 3 ([c777056](https://github.com/BTRC-Solutions/careerly/commit/c777056ace89b993f7d318d2af30d09a67551f1b))

## [0.2.0](https://github.com/BTRC-Solutions/careerly/compare/v0.1.0...v0.2.0) (2026-11-16)


### Features

* **ai:** LlmClient with a Gemini adapter, structured output and usage log (F4.1) ([d7a4199](https://github.com/BTRC-Solutions/careerly/commit/d7a41995f39e0d7405c11c3073756175161b74c7))
* import a CV into the master profile (F2.7) ([8cc574c](https://github.com/BTRC-Solutions/careerly/commit/8cc574c0a2de80253fa8bb7886a671b1cff9ec37))
* **profile:** per-session change log of gap answers, with undo (F2.6) ([6148a5c](https://github.com/BTRC-Solutions/careerly/commit/6148a5c1046d88ca70da31078264c756baeebcee))
* **profile:** per-session change log of gap answers, with undo (F2.6) ([9f580f4](https://github.com/BTRC-Solutions/careerly/commit/9f580f4cd987479fbf8ad0de79c3bfc6e7c9d80a))
* **settings:** choose the AI model per tier in Settings (F4.10) ([a39a627](https://github.com/BTRC-Solutions/careerly/commit/a39a62781f5bbf025098fa260f8dd1ea10c7b7ab))
* **settings:** choose the AI model per tier in Settings (F4.10) ([31e42cb](https://github.com/BTRC-Solutions/careerly/commit/31e42cb67c1e1c63acc9361529d94a65358936fa))
* **web:** import a CV from the master profile and review it before saving (F2.7) ([2da7ee9](https://github.com/BTRC-Solutions/careerly/commit/2da7ee9e231d648de15dcd463ce84824c649fa02))


### Bug Fixes

* **profile:** capitalize language names in an imported CV ([5a8e65d](https://github.com/BTRC-Solutions/careerly/commit/5a8e65d710181eb6b7e7eb8e79d0dfcfc94b4064))
* **profile:** keep the person's location off imported positions ([ec0afb9](https://github.com/BTRC-Solutions/careerly/commit/ec0afb9c8bcf2d297867c600d18f1e8f32795882))
* **profile:** read the link targets of an imported CV ([3b74a52](https://github.com/BTRC-Solutions/careerly/commit/3b74a526a707ca2fa5c573b4e1f7a3c5c4ca29c3))


### Miscellaneous Chores

* close phase 2 ([a381643](https://github.com/BTRC-Solutions/careerly/commit/a381643ad354119ce481577c84eee878b209edf1))

## [0.1.0](https://github.com/BTRC-Solutions/careerly/compare/v0.0.1...v0.1.0) (2026-11-16)


### Features

* **settings:** backup, restore and delete all data from Settings ([99aa54e](https://github.com/BTRC-Solutions/careerly/commit/99aa54e157a7b7b7a69ca82a9725672c80cac3b8))
* **settings:** backups, restore and delete all data in Settings (F1.3) ([416f429](https://github.com/BTRC-Solutions/careerly/commit/416f429b9b3b7dadfa3c14af10820794bd51e254))


### Miscellaneous Chores

* close phase 1 ([94c0cfc](https://github.com/BTRC-Solutions/careerly/commit/94c0cfc8f0d8118c57d2a22cdd414cb4e9b5eb46))

## 0.0.1 (2026-11-16)


### Features

* **desktop:** first Windows installer (F1.4) ([564957b](https://github.com/BTRC-Solutions/careerly/commit/564957b24ae6b9f6d47466a404f03caa0e809466))
* **desktop:** Windows installer with electron-builder ([2eea8bb](https://github.com/BTRC-Solutions/careerly/commit/2eea8bbcae46ac4237ee613221607038a08622c6))
* **settings:** release-please (0.N.X), Windows installer per release and app version (F1.6) ([b145a7e](https://github.com/BTRC-Solutions/careerly/commit/b145a7e50aa85fcc596baa06ab141fd121ead0d2))
* **settings:** release-please per-phase versioning and app version in Settings ([d95cc88](https://github.com/BTRC-Solutions/careerly/commit/d95cc88d7dfa7336249ab530073722387c10840b))
* **web:** AI provider and API key card in Settings (F1.1, lands [#17](https://github.com/BTRC-Solutions/careerly/issues/17)) ([e95c9a1](https://github.com/BTRC-Solutions/careerly/commit/e95c9a183e2b706856065a553ae5a4969feb8bd6))
* **web:** AI provider and API key card in Settings (F1.1) ([0351b88](https://github.com/BTRC-Solutions/careerly/commit/0351b88d860d00480613f2b790794f00fad20311))
* **web:** first-run wizard with telemetry consent and Settings &gt; Privacy ([70f4eb2](https://github.com/BTRC-Solutions/careerly/commit/70f4eb208ec35a68f31b3ccd5a6f28def5d434f1))
* **web:** first-run wizard, telemetry consent and Privacy settings (F1.1, F1.5) ([6cee547](https://github.com/BTRC-Solutions/careerly/commit/6cee54723a971a977489792edc3e38f18ee563a0))
