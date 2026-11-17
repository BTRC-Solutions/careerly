# Changelog

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
