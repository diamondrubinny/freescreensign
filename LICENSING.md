# Licensing

Rubinny uses two licenses so that the platform stays free while integrations stay easy.

| Path                                                                                                                 | License                                                                 | Why                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/server`, `apps/worker`, `apps/cms`, `apps/player`, `wrappers/`, `deploy/` and everything else not listed below | **GNU AGPL-3.0-only** + the additional terms below ([LICENSE](LICENSE)) | Anyone who runs a modified Rubinny as a network service must share their changes. |
| `packages/shared`, `packages/widget-sdk`, `packages/player-sdk`                                                      | **MIT** (see the `LICENSE` file in each package)                        | Lets anyone build widgets, players and integrations, including proprietary ones.  |

Each `package.json` states its license in the `license` field.

## Additional terms under AGPL-3.0 Section 7

The following additional terms apply to all AGPL-licensed parts of Rubinny,
as permitted by Section 7 of the GNU Affero General Public License v3:

1. **Attribution (Section 7(b)).** Any interactive user interface of the
   management dashboard (CMS) of the Program or of a work based on it must
   keep, in its Appropriate Legal Notices, a reasonably visible notice reading
   "Powered by Rubinny" together with a link to the Rubinny source code
   repository and the copyright notices. A footer or an "About" screen is
   sufficient. This term does **not** require any notice on the content shown
   on signage screens/players.
2. **Marking modified versions (Section 7(c)).** Modified versions must be
   marked in reasonable ways as different from the original version (for
   example "based on Rubinny") and must not misrepresent their origin.
3. **Trademarks (Section 7(e)).** This license does not grant any right to use
   the Rubinny name, logos or other trademarks except as described in
   [TRADEMARKS.md](TRADEMARKS.md).

> These terms are a technical draft and **require legal review** before the
> first public release.

Copyright (C) 2026 The Rubinny Authors.

## Bundled fonts

The player and the dashboard bundle these fonts from npm (Fontsource), each under the
[SIL Open Font License 1.1](https://openfontlicense.org); each package carries its license
file. They are served from your own server, with no requests to font services.

| Font             | Package                                 | Scripts               |
| ---------------- | --------------------------------------- | --------------------- |
| Heebo            | `@fontsource-variable/heebo`            | Hebrew, Latin         |
| Rubik            | `@fontsource-variable/rubik`            | Hebrew, Latin, others |
| Frank Ruhl Libre | `@fontsource-variable/frank-ruhl-libre` | Hebrew, Latin         |
| Secular One      | `@fontsource/secular-one`               | Hebrew, Latin         |
| Bebas Neue       | `@fontsource/bebas-neue`                | Latin only            |
