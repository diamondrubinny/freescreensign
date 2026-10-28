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

1. **Attribution (Section 7(b)).** The Program and any work based on it must
   keep the following author attributions and legal notices:
   - in the Appropriate Legal Notices of every interactive user interface (the
     management dashboard, the setup screens of the desktop, Android and TV
     apps, and the player's pairing and idle screens), a reasonably visible
     notice reading "Powered by Rubinny · Open source" (or its Hebrew
     equivalent "מופעל על ידי Rubinny · קוד פתוח"), together with a link to
     the Rubinny source code repository and the copyright notices; a footer or
     an "About" screen is sufficient for the dashboard;
   - the attribution header at the top of each source file, and the
     attribution notice at the top of each built file.

   This term does **not** require any notice on the content shown on signage
   screens while they play an organization's content.

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

## Libraries with notable licenses

Most dependencies use permissive licenses (MIT, ISC, Apache-2.0, BSD); the SBOM attached to
each release lists them all. Two server libraries have copyleft terms:

| Library                                                | License          | Used for                                                    | Notes                                                                                                                                          |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@hebcal/core`](https://github.com/hebcal/hebcal-es6) | GPL-2.0-or-later | Synagogue times: times of the day, holidays, Torah portions | Used only in `apps/server` (AGPL-3.0); GPL-2.0-or-later may be used under GPL-3.0, which can be combined with AGPL-3.0. Never in MIT packages. |
| [`ical.js`](https://github.com/kewisch/ical.js)        | MPL-2.0          | Reading iCal calendars for the events calendar widget       | File-level copyleft: changes to its own files would be shared under MPL-2.0; Rubinny uses it unchanged.                                        |

> The compatibility notes above are a technical reading and **require legal review**.

## Rubinny Art Pack

The illustrations and backgrounds of the starter kits (restaurant, café, cinema, shop, office,
hotel, community) are original artwork drawn in code for Rubinny, in
`apps/server/src/modules/kits/art.ts`. They are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): use them for anything, no
attribution needed. They contain no photos and no third-party material. The names of
places in the kits ("Vine Bistro", "Lumen Cinema", "Orion Tech" and the like) are invented.
