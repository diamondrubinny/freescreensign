// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { StarterKit } from './kits.js';
import {
  design,
  drop,
  enter,
  glow,
  headline,
  image,
  shape,
  text,
  zoneSize,
  type Locale,
} from './kit-design.js';

/**
 * Starter kits by trade (docs/phases/15-showcase.md): restaurant, café, cinema, shop, office
 * lobby, hotel and community; and a synagogue and a meeting room
 * (docs/phases/18-rooms-directory-calendar-zmanim.md). Names of places are invented; links
 * point at example.org.
 * Colors are chosen for contrast (checked in the tests).
 */

const both = <T>(build: (locale: Locale) => T): Record<Locale, T> => ({
  he: build('he'),
  en: build('en'),
});
const L = (he: string, en: string) => ({ he, en });
const pick = (locale: Locale, he: string, en: string) => (locale === 'he' ? he : en);
const price = (locale: Locale, ils: string, usd: string) => (locale === 'he' ? ils : usd);
const currency = (locale: Locale) => (locale === 'he' ? 'ILS' : 'USD');
/** Money shown inside designs (menus format theirs from numbers). */
const money = (locale: Locale, ils: number, usd: number) =>
  locale === 'he' ? `${String(ils)} ₪` : `$${String(usd)}`;
/** A design's x for the side where a language starts reading (Hebrew: right). */
const startX = (locale: Locale, width: number, boxWidth: number, margin: number) =>
  locale === 'he' ? width - boxWidth - margin : margin;
const endX = (locale: Locale, width: number, boxWidth: number, margin: number) =>
  locale === 'he' ? margin : width - boxWidth - margin;

// ---- Restaurant --------------------------------------------------------------------------

const restaurant = (): StarterKit => {
  const side = zoneSize('showcase', 'side');
  return {
    id: 'restaurant',
    template: 'showcase',
    name: L('מסעדה — ביסטרו הגפן', 'Restaurant — Vine Bistro'),
    background: '#0f0906',
    widgets: [
      {
        key: 'menu',
        type: 'menu',
        name: L('תפריט המסעדה', 'Restaurant menu'),
        config: both((locale) => ({
          title: pick(locale, 'ביסטרו הגפן', 'Vine Bistro'),
          subtitle: pick(locale, 'מטבח ים־תיכוני של עונה', 'Seasonal Mediterranean kitchen'),
          style: 'classic',
          columns: 2,
          currency: currency(locale),
          locale,
          textColor: '#fdf6ec',
          background: '#160d08',
          accent: '#e0b07d',
          sections: [
            {
              title: pick(locale, 'ראשונות', 'Starters'),
              items: [
                {
                  name: pick(locale, 'לחם הבית', 'House bread'),
                  description: pick(
                    locale,
                    'שמן זית, זעתר וסלק צלוי',
                    "Olive oil, za'atar, roasted beet",
                  ),
                  price: price(locale, '24', '9'),
                  tags: ['vegan'],
                },
                {
                  name: pick(locale, 'סלט עגבניות שוק', 'Market tomato salad'),
                  description: pick(
                    locale,
                    'בצל סגול, בזיליקום וגבינת עיזים',
                    'Red onion, basil, goat cheese',
                  ),
                  price: price(locale, '38', '14'),
                  tags: ['vegetarian'],
                },
                {
                  name: pick(locale, 'קרפצ׳יו סלק', 'Beet carpaccio'),
                  description: pick(locale, 'אגוזי מלך ושמן כמהין', 'Walnuts and truffle oil'),
                  price: price(locale, '42', '16'),
                  tags: ['vegan', 'new'],
                },
              ],
            },
            {
              title: pick(locale, 'עיקריות', 'Mains'),
              items: [
                {
                  name: pick(locale, 'סטייק אנטריקוט', 'Rib-eye steak'),
                  description: pick(
                    locale,
                    'תפוחי אדמה צלויים וחמאת עשבים',
                    'Roast potatoes, herb butter',
                  ),
                  price: price(locale, '128', '46'),
                  tags: ['recommended'],
                },
                {
                  name: pick(locale, 'פילה דניס', 'Sea bream fillet'),
                  description: pick(
                    locale,
                    'ירקות שוק ולימון כבוש',
                    'Market vegetables, cured lemon',
                  ),
                  price: price(locale, '98', '38'),
                  tags: ['gluten-free'],
                },
                {
                  name: pick(locale, 'ניוקי בטטה', 'Sweet potato gnocchi'),
                  description: pick(locale, 'מרווה, חמאה חומה ופקאן', 'Sage, brown butter, pecans'),
                  price: price(locale, '72', '27'),
                  tags: ['vegetarian'],
                },
                {
                  name: pick(locale, 'קציצות טלה', 'Lamb kebabs'),
                  description: pick(
                    locale,
                    'רוטב עגבניות חריף ויוגורט',
                    'Spicy tomato sauce, yogurt',
                  ),
                  price: price(locale, '84', '31'),
                  tags: ['spicy'],
                },
              ],
            },
            {
              title: pick(locale, 'קינוחים', 'Desserts'),
              items: [
                {
                  name: pick(locale, 'פונדנט שוקולד', 'Chocolate fondant'),
                  description: pick(locale, 'גלידת וניל', 'Vanilla ice cream'),
                  price: price(locale, '44', '15'),
                  tags: [],
                },
                {
                  name: pick(locale, 'טארט לימון', 'Lemon tart'),
                  description: pick(locale, 'מרנג קלוי', 'Toasted meringue'),
                  price: price(locale, '42', '14'),
                  tags: ['new'],
                },
                {
                  name: pick(locale, 'מלבי ורדים', 'Rose malabi'),
                  description: pick(locale, 'פיסטוקים וסירופ פטל', 'Pistachios, raspberry syrup'),
                  price: price(locale, '36', '12'),
                  tags: ['gluten-free'],
                },
              ],
            },
            {
              title: pick(locale, 'משקאות', 'Drinks'),
              items: [
                {
                  name: pick(locale, 'יין הבית (כוס)', 'House wine (glass)'),
                  price: price(locale, '34', '12'),
                  tags: [],
                },
                {
                  name: pick(locale, 'לימונדה נענע', 'Mint lemonade'),
                  price: price(locale, '18', '7'),
                  tags: ['vegan'],
                },
                {
                  name: pick(locale, 'אספרסו', 'Espresso'),
                  price: price(locale, '12', '4'),
                  tags: [],
                },
              ],
            },
          ],
        })),
      },
      {
        key: 'special',
        type: 'design',
        name: L('מנת היום', 'Dish of the day'),
        config: both((locale) =>
          design(
            side,
            '#1c120c',
            [
              text({
                text: pick(locale, 'מנת היום', 'Dish of the day'),
                x: 60,
                y: 56,
                w: 610,
                h: 60,
                fontSize: 36,
                fontWeight: 600,
                color: '#e0b07d',
                letterSpacing: 0.2,
                uppercase: true,
                ...enter('fade'),
              }),
              shape({
                x: 315,
                y: 126,
                w: 100,
                h: 4,
                fill: '#e0b07d',
                radius: 2,
                ...enter('fade', 200),
              }),
              image('dish', {
                x: 95,
                y: 160,
                w: 540,
                h: 540,
                ...enter('zoom', 200, 'float', 1000),
              }),
              shape({
                shape: 'ellipse',
                x: 500,
                y: 150,
                w: 190,
                h: 190,
                fill: '#e0b07d',
                ...drop('aa'),
                ...enter('pop', 1100, 'pulse'),
              }),
              text({
                text: money(locale, 89, 34),
                x: 500,
                y: 205,
                w: 190,
                h: 80,
                fontSize: 54,
                fontWeight: 800,
                color: '#1c120c',
                ...enter('pop', 1100, 'pulse'),
              }),
              text({
                text: pick(locale, 'כתף טלה בבישול איטי', 'Slow-roasted lamb'),
                x: 30,
                y: 705,
                w: 670,
                h: 90,
                font: 'frank-ruhl',
                fontSize: 58,
                fontWeight: 600,
                color: '#fdf6ec',
                ...drop('cc'),
                ...enter('slide-up', 500),
              }),
              text({
                text: pick(
                  locale,
                  'ירקות שורש, זיגוג רימונים\nועשבי תיבול מהגינה שלנו',
                  'Root vegetables, pomegranate glaze\nand herbs from our garden',
                ),
                x: 50,
                y: 800,
                w: 630,
                h: 110,
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.35,
                color: '#f1e4d3',
                ...drop('cc'),
                ...enter('fade', 800),
              }),
            ],
            { backgroundMediaId: 'art:ember' },
          ),
        ),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('מבצעי המסעדה', 'Restaurant offers'),
        config: both((locale) => ({
          label: pick(locale, 'היום', 'Today'),
          text: pick(
            locale,
            'שעה שמחה 17:00-19:00: כוס שנייה של יין עלינו · המטבח פתוח עד 23:00 · אירועים פרטיים? דברו איתנו',
            'Happy hour 5–7 pm: your second glass of wine is on us · Kitchen open until 11 pm · Private events? Ask us',
          ),
          textColor: '#ffffff',
          background: '#7c2d12',
        })),
      },
    ],
    zones: {
      main: { playlist: L('מסעדה — תפריט', 'Restaurant — menu'), widgets: ['menu'] },
      side: {
        playlist: L('מסעדה — מנת היום', 'Restaurant — dish of the day'),
        widgets: ['special'],
      },
      ticker: { playlist: L('מסעדה — עדכונים', 'Restaurant — updates'), widgets: ['ticker'] },
    },
  };
};

// ---- Café ----------------------------------------------------------------------------------

const cafe = (): StarterKit => {
  const side = zoneSize('showcase', 'side');
  const offer = (
    key: string,
    art: 'coffee' | 'cake',
    title: Record<Locale, string>,
    line: Record<Locale, string>,
    cost: (locale: Locale) => string,
    note: Record<Locale, string>,
  ) => ({
    key,
    type: 'design' as const,
    name: title,
    config: both((locale) =>
      design(
        side,
        '#1f2a26',
        [
          text({
            text: title[locale],
            x: 40,
            y: 70,
            w: 650,
            h: 80,
            font: 'rubik',
            fontSize: 56,
            fontWeight: 800,
            color: '#fde68a',
            ...enter('fade'),
          }),
          image(art, { x: 115, y: 170, w: 500, h: 500, ...enter('zoom', 200, 'float', 1000) }),
          text({
            text: line[locale],
            x: 40,
            y: 680,
            w: 650,
            h: 70,
            font: 'rubik',
            fontSize: 40,
            fontWeight: 600,
            color: '#f8fafc',
            ...enter('slide-up', 500),
          }),
          text({
            text: cost(locale),
            x: 215,
            y: 765,
            w: 300,
            h: 84,
            font: 'rubik',
            fontSize: 46,
            fontWeight: 800,
            color: '#1f2a26',
            background: '#fcd34d',
            radius: 42,
            ...drop('80'),
            ...enter('pop', 900, 'pulse'),
          }),
          text({
            text: note[locale],
            x: 40,
            y: 865,
            w: 650,
            h: 50,
            font: 'rubik',
            fontSize: 28,
            fontWeight: 400,
            color: '#e2e8f0',
            ...enter('fade', 1200),
          }),
        ],
        { backgroundMediaId: 'art:chalkboard' },
      ),
    ),
  });
  return {
    id: 'cafe',
    template: 'showcase',
    name: L('בית קפה — קפה בוקר', 'Café — Morning Café'),
    background: '#101614',
    widgets: [
      {
        key: 'menu',
        type: 'menu',
        name: L('לוח בית הקפה', 'Café board'),
        config: both((locale) => ({
          title: pick(locale, 'קפה בוקר', 'Morning Café'),
          subtitle: pick(locale, 'קלוי טרי כל בוקר', 'Freshly roasted every morning'),
          style: 'chalkboard',
          columns: 2,
          currency: currency(locale),
          locale,
          textColor: '#f8fafc',
          background: '#1f2a26',
          accent: '#fcd34d',
          sections: [
            {
              title: pick(locale, 'קפה', 'Coffee'),
              items: [
                {
                  name: pick(locale, 'אספרסו', 'Espresso'),
                  price: price(locale, '9', '3'),
                  tags: [],
                },
                {
                  name: pick(locale, 'הפוך', 'Flat white'),
                  description: pick(locale, 'גם עם חלב שיבולת שועל', 'Oat milk on request'),
                  price: price(locale, '14', '4.5'),
                  tags: ['recommended'],
                },
                {
                  name: pick(locale, 'קפה קר', 'Cold brew'),
                  price: price(locale, '15', '4.5'),
                  tags: [],
                },
                {
                  name: pick(locale, 'צ׳אי לאטה', 'Chai latte'),
                  price: price(locale, '16', '5'),
                  tags: ['new'],
                },
              ],
            },
            {
              title: pick(locale, 'מאפים', 'Pastries'),
              items: [
                {
                  name: pick(locale, 'קרואסון חמאה', 'Butter croissant'),
                  price: price(locale, '12', '3.5'),
                  tags: [],
                },
                {
                  name: pick(locale, 'רוגלך שוקולד', 'Chocolate rugelach'),
                  price: price(locale, '8', '2.5'),
                  tags: ['recommended'],
                },
                {
                  name: pick(locale, 'עוגת גבינה', 'Cheesecake'),
                  description: pick(locale, 'פרוסה', 'Per slice'),
                  price: price(locale, '22', '6.5'),
                  tags: ['vegetarian'],
                },
              ],
            },
            {
              title: pick(locale, 'ארוחת בוקר', 'Breakfast'),
              items: [
                {
                  name: pick(locale, 'שקשוקה', 'Shakshuka'),
                  description: pick(locale, 'לחם הבית וטחינה', 'House bread and tahini'),
                  price: price(locale, '46', '13'),
                  tags: ['vegetarian', 'spicy'],
                },
                {
                  name: pick(locale, 'טוסט אבוקדו', 'Avocado toast'),
                  description: pick(locale, 'ביצה עלומה וצ׳ילי', 'Poached egg and chili'),
                  price: price(locale, '38', '11'),
                  tags: ['vegetarian'],
                },
                {
                  name: pick(locale, 'יוגורט וגרנולה', 'Yogurt and granola'),
                  description: pick(locale, 'פירות העונה וסילאן', 'Seasonal fruit, date honey'),
                  price: price(locale, '32', '9'),
                  tags: ['vegetarian'],
                },
              ],
            },
          ],
        })),
      },
      offer(
        'coffee',
        'coffee',
        L('הקפה של הבוקר', 'Morning deal'),
        L('הפוך + קרואסון', 'Flat white + croissant'),
        (locale) => money(locale, 19, 6),
        L('בכל יום עד 11:00', 'Every day until 11 am'),
      ),
      offer(
        'cake',
        'cake',
        L('העוגה של היום', 'Cake of the day'),
        L('עוגת שכבות ותותים', 'Strawberry layer cake'),
        (locale) => money(locale, 24, 7),
        L('אפויה אצלנו הבוקר', 'Baked here this morning'),
      ),
      {
        key: 'clock',
        type: 'clock',
        name: L('שעון בית הקפה', 'Café clock'),
        config: both((locale) => ({ locale, textColor: '#f8fafc', background: '#1f2a26' })),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('שעות פתיחה', 'Opening hours'),
        config: both((locale) => ({
          label: pick(locale, 'בוקר טוב', 'Good morning'),
          text: pick(
            locale,
            'פתוח א׳–ה׳ 07:00-19:00 · שישי 07:00-14:00 · Wi-Fi: Cafe-Guest · כוס רב פעמית? 2 ₪ הנחה',
            'Open Sun–Thu 7 am–7 pm · Fri 7 am–2 pm · Wi-Fi: Cafe-Guest · Bring your own cup: 50¢ off',
          ),
          textColor: '#ffffff',
          background: '#14532d',
        })),
      },
    ],
    zones: {
      main: { playlist: L('בית קפה — לוח', 'Café — board'), widgets: ['menu'] },
      side: {
        playlist: L('בית קפה — הצעות', 'Café — offers'),
        widgets: [
          { key: 'coffee', durationMs: 10_000 },
          { key: 'cake', durationMs: 10_000 },
          'clock',
        ],
      },
      ticker: { playlist: L('בית קפה — שעות', 'Café — hours'), widgets: ['ticker'] },
    },
  };
};

// ---- Cinema ------------------------------------------------------------------------------

const cinema = (): StarterKit => {
  const main = zoneSize('showcase', 'main');
  const poster = (
    key: string,
    art: 'posterLighthouse' | 'posterPlanet' | 'posterCity',
    title: Record<Locale, string>,
    about: Record<Locale, string>,
    times: Record<Locale, string>,
  ) => ({
    key,
    type: 'design' as const,
    name: L(`פוסטר — ${title.he}`, `Poster — ${title.en}`),
    config: both((locale) => {
      const posterX = endX(locale, main.w, 547, 60);
      const textX = startX(locale, main.w, 500, 50);
      return design(
        main,
        '#070b18',
        [
          image(art, {
            x: posterX,
            y: 65,
            w: 547,
            h: 820,
            fit: 'cover',
            radius: 18,
            ...drop('cc'),
            ...enter('zoom'),
          }),
          text({
            text: pick(locale, 'עכשיו בקולנוע', 'Now showing'),
            x: textX,
            y: 110,
            w: 500,
            h: 56,
            fontSize: 34,
            fontWeight: 600,
            color: '#fbbf24',
            letterSpacing: 0.2,
            uppercase: true,
            align: 'start',
            ...enter('fade', 300),
          }),
          text({
            text: title[locale],
            x: textX,
            y: 175,
            w: 500,
            h: 280,
            font: headline(locale),
            fontSize: locale === 'he' ? 92 : 118,
            fontWeight: locale === 'he' ? 400 : 400,
            lineHeight: 1,
            color: '#fff7d6',
            align: 'start',
            ...glow('#f59e0b99', 36),
            ...enter('slide-up', 500),
          }),
          text({
            text: about[locale],
            x: textX,
            y: 465,
            w: 500,
            h: 50,
            fontSize: 30,
            fontWeight: 400,
            color: '#cbd5e1',
            align: 'start',
            ...enter('fade', 900),
          }),
          shape({
            x: locale === 'he' ? textX + 500 - 120 : textX,
            y: 535,
            w: 120,
            h: 6,
            fill: '#fbbf24',
            radius: 3,
            ...enter('fade', 1000),
          }),
          text({
            text: times[locale],
            x: textX,
            y: 570,
            w: 500,
            h: 130,
            fontSize: 42,
            fontWeight: 600,
            lineHeight: 1.4,
            color: '#ffffff',
            align: 'start',
            ...enter('slide-up', 1100),
          }),
          text({
            text: pick(locale, 'כרטיסים בקופה ובאתר', 'Tickets at the box office'),
            x: locale === 'he' ? textX + 500 - 400 : textX,
            y: 760,
            w: 400,
            h: 80,
            fontSize: 32,
            fontWeight: 800,
            color: '#111827',
            background: '#fbbf24',
            radius: 40,
            ...drop('99'),
            ...enter('pop', 1500, 'pulse'),
          }),
        ],
        { backgroundMediaId: 'art:cinema' },
      );
    }),
  });
  return {
    id: 'cinema',
    template: 'showcase',
    name: L('בית קולנוע — קולנוע אורות', 'Cinema — Lumen Cinema'),
    background: '#03040a',
    widgets: [
      poster(
        'lighthouse',
        'posterLighthouse',
        L('המגדלור האחרון', 'THE LAST LIGHTHOUSE'),
        L('דרמה · שעתיים · מגיל 12', 'Drama · 2 h · PG-13'),
        L('אולם 1\n18:00 · 20:30 · 22:45', 'Hall 1\n6:00 · 8:30 · 10:45 pm'),
      ),
      poster(
        'planet',
        'posterPlanet',
        L('אופק אדום', 'RED HORIZON'),
        L('מדע בדיוני · שעתיים וחצי', 'Sci-fi · 2 h 30 min'),
        L('אולם 2\n17:15 · 20:00 · 22:30', 'Hall 2\n5:15 · 8:00 · 10:30 pm'),
      ),
      poster(
        'city',
        'posterCity',
        L('רכבת לילה', 'NIGHT TRAIN'),
        L('מותחן · שעה ו־50 דקות · מגיל 16', 'Thriller · 1 h 50 min · R'),
        L('אולם 3\n19:00 · 21:15', 'Hall 3\n7:00 · 9:15 pm'),
      ),
      {
        key: 'combo',
        type: 'design',
        name: L('קומבו פופקורן', 'Popcorn combo'),
        config: both((locale) =>
          design(
            main,
            '#2a0a10',
            [
              image('popcorn', {
                x: endX(locale, main.w, 520, 60),
                y: 150,
                w: 520,
                h: 520,
                ...enter('zoom', 0, 'sway', 900),
              }),
              image('ticket', {
                x: endX(locale, main.w, 440, 120),
                y: 620,
                w: 440,
                h: 275,
                ...enter('slide-up', 600),
              }),
              text({
                text: pick(locale, 'קומבו לסרט', 'Movie combo'),
                x: startX(locale, main.w, 520, 50),
                y: 200,
                w: 520,
                h: 200,
                font: headline(locale),
                fontSize: locale === 'he' ? 100 : 130,
                fontWeight: 400,
                lineHeight: 1,
                color: '#fde68a',
                align: 'start',
                ...drop('cc'),
                ...enter('slide-up', 300),
              }),
              text({
                text: pick(locale, 'פופקורן גדול\n+ שתייה קרה', 'Large popcorn\n+ cold drink'),
                x: startX(locale, main.w, 520, 50),
                y: 420,
                w: 520,
                h: 140,
                fontSize: 46,
                fontWeight: 600,
                lineHeight: 1.3,
                color: '#ffffff',
                align: 'start',
                ...enter('fade', 700),
              }),
              text({
                text: money(locale, 25, 8),
                x: locale === 'he' ? main.w - 50 - 260 : 50,
                y: 620,
                w: 260,
                h: 110,
                fontSize: 64,
                fontWeight: 800,
                color: '#7f1d1d',
                background: '#fde68a',
                radius: 55,
                ...drop('99'),
                ...enter('pop', 1100, 'pulse'),
              }),
            ],
            {
              backgroundGradient: {
                type: 'radial',
                angle: 0,
                stops: [
                  { color: '#7f1d1d', at: 0 },
                  { color: '#1c0508', at: 100 },
                ],
              },
            },
          ),
        ),
      },
      {
        key: 'showtimes',
        type: 'menu',
        name: L('לוח הקרנות', 'Showtimes'),
        config: both((locale) => ({
          title: pick(locale, 'הקרנות היום', "Today's showtimes"),
          style: 'modern',
          columns: 1,
          currency: 'none',
          locale,
          textColor: '#f8fafc',
          background: '#0a0f22',
          accent: '#fbbf24',
          sections: [
            {
              title: pick(locale, 'אולם 1', 'Hall 1'),
              items: [
                {
                  name: pick(locale, 'המגדלור האחרון', 'The Last Lighthouse'),
                  price: pick(locale, '18:00 · 20:30 · 22:45', '6:00 · 8:30 · 10:45'),
                  tags: ['recommended'],
                },
              ],
            },
            {
              title: pick(locale, 'אולם 2', 'Hall 2'),
              items: [
                {
                  name: pick(locale, 'אופק אדום', 'Red Horizon'),
                  price: pick(locale, '17:15 · 20:00 · 22:30', '5:15 · 8:00 · 10:30'),
                  tags: ['new'],
                },
                {
                  name: pick(locale, 'הדובון הקטן', 'Little Bear'),
                  price: pick(locale, '11:00 · 13:00', '11:00 · 1:00'),
                  description: pick(locale, 'מדובב לעברית', 'Family film'),
                  tags: [],
                },
              ],
            },
            {
              title: pick(locale, 'אולם 3', 'Hall 3'),
              items: [
                {
                  name: pick(locale, 'רכבת לילה', 'Night Train'),
                  price: pick(locale, '19:00 · 21:15', '7:00 · 9:15'),
                  tags: [],
                },
              ],
            },
          ],
        })),
      },
      {
        key: 'tickets',
        type: 'qr',
        name: L('הזמנת כרטיסים', 'Book tickets'),
        config: both((locale) => ({
          url: 'https://example.org/tickets',
          label: pick(locale, 'הזמנת כרטיסים', 'Book tickets'),
        })),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('עדכוני הקולנוע', 'Cinema updates'),
        config: both((locale) => ({
          label: pick(locale, 'השבוע', 'This week'),
          text: pick(
            locale,
            'בכורה ביום חמישי: המגדלור האחרון · בימי שלישי כרטיס לסטודנטים ב־30 ₪ · חניה חינם אחרי 19:00',
            'Premiere on Thursday: The Last Lighthouse · Tuesdays: student tickets $9 · Free parking after 7 pm',
          ),
          textColor: '#ffffff',
          background: '#312e81',
        })),
      },
    ],
    zones: {
      main: {
        playlist: L('קולנוע — פוסטרים', 'Cinema — posters'),
        widgets: [
          { key: 'lighthouse', durationMs: 10_000 },
          { key: 'planet', durationMs: 10_000 },
          { key: 'city', durationMs: 10_000 },
          { key: 'combo', durationMs: 8000 },
        ],
      },
      side: {
        playlist: L('קולנוע — הקרנות', 'Cinema — showtimes'),
        widgets: [{ key: 'showtimes', durationMs: 20_000 }, 'tickets'],
      },
      ticker: { playlist: L('קולנוע — עדכונים', 'Cinema — updates'), widgets: ['ticker'] },
    },
  };
};

// ---- Shop and sales ----------------------------------------------------------------------

const retail = (): StarterKit => {
  const main = zoneSize('l-bar', 'main');
  return {
    id: 'retail',
    template: 'l-bar',
    name: L('חנות ומבצעים', 'Shop and sales'),
    background: '#1a0505',
    widgets: [
      {
        key: 'sale',
        type: 'design',
        name: L('מבצע סוף עונה', 'End of season sale'),
        config: both((locale) => {
          const textX = startX(locale, main.w, 780, 70);
          return design(
            main,
            '#7f1d1d',
            [
              image('tag', {
                x: endX(locale, main.w, 520, 70),
                y: 190,
                w: 520,
                h: 520,
                ...enter('zoom', 400, 'sway', 900),
              }),
              text({
                text: pick(locale, 'סוף עונה', 'End of season'),
                x: textX,
                y: 110,
                w: 780,
                h: 130,
                font: headline(locale),
                fontSize: locale === 'he' ? 104 : 120,
                fontWeight: 400,
                color: '#ffffff',
                align: 'start',
                ...drop('99'),
                ...enter('slide-up'),
              }),
              text({
                text: '-50%',
                x: textX,
                y: 230,
                w: 780,
                h: 360,
                font: 'bebas-neue',
                fontSize: 330,
                fontWeight: 400,
                lineHeight: 1,
                color: '#fde047',
                align: 'start',
                outline: { color: '#7f1d1d', width: 4 },
                ...drop('aa'),
                ...enter('pop', 300, 'pulse', 900),
              }),
              text({
                text: pick(
                  locale,
                  'על כל פריטי הקיץ המסומנים\nבתוקף עד סוף החודש',
                  'On all marked summer items\nUntil the end of the month',
                ),
                x: textX,
                y: 610,
                w: 780,
                h: 140,
                fontSize: 46,
                fontWeight: 600,
                lineHeight: 1.35,
                color: '#fff7ed',
                align: 'start',
                ...drop('aa'),
                ...enter('fade', 800),
              }),
              text({
                text: pick(locale, 'בכל הסניפים', 'In all our stores'),
                x: locale === 'he' ? textX + 780 - 360 : textX,
                y: 780,
                w: 360,
                h: 84,
                fontSize: 38,
                fontWeight: 800,
                color: '#7f1d1d',
                background: '#fde047',
                radius: 42,
                ...drop('99'),
                ...enter('slide-up', 1100),
              }),
            ],
            { backgroundMediaId: 'art:burst' },
          );
        }),
      },
      {
        key: 'collection',
        type: 'design',
        name: L('קולקציה חדשה', 'New collection'),
        config: both((locale) =>
          design(
            main,
            '#2e1065',
            [
              shape({
                shape: 'ellipse',
                x: -180,
                y: -220,
                w: 720,
                h: 720,
                fill: '#7c3aed',
                opacity: 0.5,
                ...enter('fade', 0, 'float', 1500),
              }),
              shape({
                shape: 'ellipse',
                x: 1020,
                y: 500,
                w: 640,
                h: 640,
                fill: '#db2777',
                opacity: 0.4,
                ...enter('fade', 300, 'float', 1500),
              }),
              text({
                text: pick(locale, 'חדש בחנות', 'Just arrived'),
                x: 170,
                y: 250,
                w: 1100,
                h: 80,
                fontSize: 48,
                fontWeight: 600,
                color: '#f9a8d4',
                letterSpacing: 0.25,
                uppercase: true,
                ...enter('fade', 200),
              }),
              text({
                text: pick(locale, 'קולקציית הסתיו', 'The autumn collection'),
                x: 70,
                y: 340,
                w: 1300,
                h: 190,
                font: locale === 'he' ? 'frank-ruhl' : 'bebas-neue',
                fontSize: locale === 'he' ? 130 : 160,
                fontWeight: locale === 'he' ? 600 : 400,
                color: '#ffffff',
                ...glow('#db277799', 40),
                ...enter('zoom', 500),
              }),
              shape({
                x: 620,
                y: 560,
                w: 200,
                h: 5,
                fill: '#f9a8d4',
                radius: 3,
                ...enter('fade', 900),
              }),
              text({
                text: pick(
                  locale,
                  'בואו להתרשם — והקפה עלינו',
                  'Come and see — the coffee is on us',
                ),
                x: 170,
                y: 600,
                w: 1100,
                h: 70,
                fontSize: 44,
                fontWeight: 400,
                color: '#ede9fe',
                ...enter('slide-up', 1100),
              }),
            ],
            {
              backgroundGradient: {
                type: 'linear',
                angle: 135,
                stops: [
                  { color: '#1e1b4b', at: 0 },
                  { color: '#4c1d95', at: 60 },
                  { color: '#831843', at: 100 },
                ],
              },
            },
          ),
        ),
      },
      {
        key: 'join',
        type: 'design',
        name: L('מועדון הלקוחות', 'Members club'),
        config: both((locale) => {
          const side = zoneSize('l-bar', 'side');
          return design(
            side,
            '#450a0a',
            [
              image('tag', { x: 60, y: 70, w: 360, h: 360, ...enter('zoom', 0, 'sway', 900) }),
              text({
                text: pick(locale, 'מועדון הלקוחות', 'Members club'),
                x: 30,
                y: 470,
                w: 420,
                h: 130,
                font: headline(locale),
                fontSize: locale === 'he' ? 58 : 76,
                fontWeight: 400,
                lineHeight: 1.05,
                color: '#ffffff',
                ...enter('slide-up', 300),
              }),
              text({
                text: pick(locale, '10% הנחה\nעל כל קנייה', '10% off\nevery purchase'),
                x: 30,
                y: 620,
                w: 420,
                h: 130,
                fontSize: 44,
                fontWeight: 800,
                lineHeight: 1.2,
                color: '#fde047',
                ...enter('pop', 700, 'pulse'),
              }),
              text({
                text: pick(locale, 'הצטרפות בקופה או בקוד', 'Join at the till or with the code'),
                x: 30,
                y: 780,
                w: 420,
                h: 90,
                fontSize: 30,
                fontWeight: 400,
                lineHeight: 1.3,
                color: '#fee2e2',
                ...enter('fade', 1100),
              }),
            ],
            {
              backgroundGradient: {
                type: 'linear',
                angle: 180,
                stops: [
                  { color: '#7f1d1d', at: 0 },
                  { color: '#450a0a', at: 100 },
                ],
              },
            },
          );
        }),
      },
      {
        key: 'countdown',
        type: 'countdown',
        name: L('המבצע מסתיים', 'Sale ends'),
        config: both((locale) => ({
          title: pick(locale, 'המבצע מסתיים בעוד', 'The sale ends in'),
          target: '2026-12-31T20:00',
          doneText: pick(locale, 'המבצע הסתיים', 'The sale has ended'),
          showSeconds: true,
          locale,
          textColor: '#ffffff',
          background: '#450a0a',
        })),
      },
      {
        key: 'club',
        type: 'qr',
        name: L('מועדון הלקוחות', 'Members club'),
        config: both((locale) => ({
          url: 'https://example.org/club',
          label: pick(locale, 'הצטרפו למועדון: 10% הנחה', 'Join the club: 10% off'),
        })),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('עדכוני החנות', 'Store updates'),
        config: both((locale) => ({
          label: pick(locale, 'חדש', 'New'),
          text: pick(
            locale,
            'משלוח חינם בקנייה מעל 200 ₪ · החלפה עד 30 יום עם קבלה · חברי מועדון: 10% נוסף על כל קנייה',
            'Free delivery over $60 · Exchanges within 30 days with a receipt · Members: an extra 10% off',
          ),
          textColor: '#ffffff',
          background: '#b91c1c',
        })),
      },
    ],
    zones: {
      main: {
        playlist: L('חנות — מבצעים', 'Shop — sales'),
        widgets: [
          { key: 'sale', durationMs: 12_000 },
          { key: 'countdown', durationMs: 8000 },
          { key: 'collection', durationMs: 10_000 },
        ],
      },
      side: {
        playlist: L('חנות — מועדון', 'Shop — club'),
        widgets: [{ key: 'join', durationMs: 10_000 }, 'club'],
      },
      bottom: { playlist: L('חנות — עדכונים', 'Shop — updates'), widgets: ['ticker'] },
    },
  };
};

// ---- Office lobby ------------------------------------------------------------------------

const office = (): StarterKit => {
  const main = zoneSize('l-bar', 'main');
  return {
    id: 'office',
    template: 'l-bar',
    name: L('לובי משרדים — Orion Tech', 'Office lobby — Orion Tech'),
    background: '#06101f',
    widgets: [
      {
        key: 'welcome',
        type: 'design',
        name: L('ברוכים הבאים', 'Welcome'),
        config: both((locale) => {
          const x = startX(locale, main.w, 1100, 90);
          return design(
            main,
            '#0b1f3a',
            [
              text({
                text: pick(locale, 'ברוכים הבאים ל־', 'Welcome to'),
                x,
                y: 190,
                w: 1100,
                h: 90,
                fontSize: 64,
                fontWeight: 600,
                color: '#7dd3fc',
                align: 'start',
                ...enter('fade'),
              }),
              text({
                text: 'Orion Tech',
                x,
                y: 280,
                w: 1100,
                h: 200,
                font: 'rubik',
                fontSize: 170,
                fontWeight: 800,
                letterSpacing: -0.02,
                color: '#ffffff',
                align: 'start',
                ...glow('#38bdf899', 50),
                ...enter('zoom', 300),
              }),
              text({
                text: pick(
                  locale,
                  'קבלת אורחים בקומה 3 · נא להירשם בעמדה או בקוד ה־QR',
                  'Reception on floor 3 · Sign in at the desk or by QR code',
                ),
                x,
                y: 500,
                w: 1100,
                h: 70,
                fontSize: 40,
                fontWeight: 400,
                color: '#e0f2fe',
                align: 'start',
                ...enter('slide-up', 800),
              }),
              text({
                text: 'Wi-Fi: Orion-Guest',
                x: locale === 'he' ? x + 1100 - 440 : x,
                y: 620,
                w: 440,
                h: 80,
                fontSize: 36,
                fontWeight: 600,
                color: '#0b1f3a',
                background: '#7dd3fc',
                radius: 40,
                ...enter('pop', 1200),
              }),
            ],
            { backgroundMediaId: 'art:waves' },
          );
        }),
      },
      {
        key: 'meetings',
        type: 'menu',
        name: L('הפגישות היום', "Today's meetings"),
        config: both((locale) => ({
          title: pick(locale, 'הפגישות היום', "Today's meetings"),
          style: 'modern',
          columns: 2,
          currency: 'none',
          locale,
          textColor: '#f1f5f9',
          background: '#0b1f3a',
          accent: '#7dd3fc',
          sections: [
            {
              title: pick(locale, 'חדר אלפא', 'Alpha room'),
              items: [
                { name: pick(locale, 'צוות מוצר', 'Product team'), price: '09:30', tags: [] },
                { name: pick(locale, 'ראיון עבודה', 'Job interview'), price: '11:00', tags: [] },
                {
                  name: pick(locale, 'סקירת רבעון', 'Quarterly review'),
                  price: '15:00',
                  tags: ['recommended'],
                },
              ],
            },
            {
              title: pick(locale, 'חדר בטא', 'Beta room'),
              items: [
                {
                  name: pick(locale, 'לקוח: Nova Labs', 'Client: Nova Labs'),
                  price: '10:00',
                  tags: [],
                },
                {
                  name: pick(locale, 'סדנת עיצוב', 'Design workshop'),
                  price: '13:30',
                  tags: ['new'],
                },
              ],
            },
            {
              title: pick(locale, 'אולם הכנסים', 'Conference hall'),
              items: [
                {
                  name: pick(locale, 'הרצאה: בינה מלאכותית בעבודה', 'Talk: AI at work'),
                  price: '12:00',
                  tags: [],
                },
                { name: pick(locale, 'ארוחת צוות', 'Team lunch'), price: '13:00', tags: [] },
              ],
            },
          ],
        })),
      },
      {
        key: 'clock',
        type: 'clock',
        name: L('שעון הלובי', 'Lobby clock'),
        config: both((locale) => ({ locale, textColor: '#ffffff', background: '#0f2a4d' })),
      },
      {
        key: 'weather',
        type: 'weather',
        name: L('מזג האוויר', 'Weather'),
        config: both((locale) => ({
          latitude: 32.0853,
          longitude: 34.7818,
          locationName: pick(locale, 'תל אביב', 'Tel Aviv'),
          days: 3,
          locale,
          textColor: '#ffffff',
          background: '#0c4a6e',
        })),
      },
      {
        key: 'visitors',
        type: 'qr',
        name: L('רישום אורחים', 'Visitor sign-in'),
        config: both((locale) => ({
          url: 'https://example.org/visitors',
          label: pick(locale, 'רישום אורחים', 'Visitor sign-in'),
        })),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('הודעות לעובדים', 'Staff notices'),
        config: both((locale) => ({
          label: pick(locale, 'הודעות', 'Notices'),
          text: pick(
            locale,
            'תרגיל פינוי ביום רביעי ב־10:00 · ברוכים הבאים לעובדים החדשים בצוות המוצר · ארוחת צוות ביום חמישי בקומה 5',
            'Evacuation drill on Wednesday at 10:00 · Welcome to the new members of the product team · Team lunch on Thursday, floor 5',
          ),
          textColor: '#ffffff',
          background: '#1d4ed8',
        })),
      },
    ],
    zones: {
      main: {
        playlist: L('לובי — ראשי', 'Lobby — main'),
        widgets: [
          { key: 'welcome', durationMs: 12_000 },
          { key: 'meetings', durationMs: 15_000 },
        ],
      },
      side: { playlist: L('לובי — צד', 'Lobby — side'), widgets: ['clock', 'weather', 'visitors'] },
      bottom: { playlist: L('לובי — הודעות', 'Lobby — notices'), widgets: ['ticker'] },
    },
  };
};

// ---- Hotel and events --------------------------------------------------------------------

const hotel = (): StarterKit => {
  const main = zoneSize('showcase', 'main');
  return {
    id: 'hotel',
    template: 'showcase',
    name: L('מלון ואירועים — מלון גליל', 'Hotel and events — Galil Hotel'),
    background: '#05070f',
    widgets: [
      {
        key: 'welcome',
        type: 'design',
        name: L('ברוכים הבאים למלון', 'Hotel welcome'),
        config: both((locale) =>
          design(
            main,
            '#0b1226',
            [
              text({
                text: pick(locale, 'ברוכים הבאים', 'Welcome to'),
                x: 95,
                y: 90,
                w: 1000,
                h: 70,
                font: 'frank-ruhl',
                fontSize: 50,
                fontWeight: 600,
                color: '#e2c46b',
                letterSpacing: 0.1,
                uppercase: true,
                ...enter('fade'),
              }),
              text({
                text: pick(locale, 'מלון גליל', 'Galil Hotel'),
                x: 95,
                y: 165,
                w: 1000,
                h: 160,
                font: 'frank-ruhl',
                fontSize: 130,
                fontWeight: 600,
                color: '#fdf6e3',
                ...glow('#d4af3780', 30),
                ...enter('zoom', 300),
              }),
              shape({
                x: 495,
                y: 340,
                w: 200,
                h: 4,
                fill: '#d4af37',
                radius: 2,
                ...enter('fade', 700),
              }),
              text({
                text: pick(
                  locale,
                  'צ׳ק־אין מ־15:00 · צ׳ק־אאוט עד 11:00',
                  'Check-in from 3 pm · Check-out by 11 am',
                ),
                x: 95,
                y: 370,
                w: 1000,
                h: 60,
                fontSize: 36,
                fontWeight: 400,
                color: '#e5e7eb',
                ...enter('fade', 900),
              }),
              image('bell', {
                x: 395,
                y: 470,
                w: 400,
                h: 400,
                ...enter('slide-up', 1100, 'float', 900),
              }),
            ],
            { backgroundMediaId: 'art:deco' },
          ),
        ),
      },
      {
        key: 'today',
        type: 'menu',
        name: L('היום במלון', 'Today at the hotel'),
        config: both((locale) => ({
          title: pick(locale, 'היום במלון', 'Today at the hotel'),
          style: 'classic',
          columns: 1,
          currency: 'none',
          locale,
          textColor: '#fdf6e3',
          background: '#0b1226',
          accent: '#e2c46b',
          sections: [
            {
              title: pick(locale, 'בוקר', 'Morning'),
              items: [
                {
                  name: pick(locale, 'ארוחת בוקר', 'Breakfast'),
                  description: pick(locale, 'חדר האוכל, קומה 1', 'Dining room, floor 1'),
                  price: '07:00-10:30',
                  tags: [],
                },
                {
                  name: pick(locale, 'יוגה בגינה', 'Yoga in the garden'),
                  price: '08:00',
                  tags: ['new'],
                },
              ],
            },
            {
              title: pick(locale, 'צהריים', 'Afternoon'),
              items: [
                { name: pick(locale, 'בריכה', 'Pool'), price: '09:00-19:00', tags: [] },
                {
                  name: pick(locale, 'סיור בעיר העתיקה', 'Old city tour'),
                  description: pick(locale, 'יציאה מהלובי', 'From the lobby'),
                  price: '14:00',
                  tags: ['recommended'],
                },
              ],
            },
            {
              title: pick(locale, 'ערב', 'Evening'),
              items: [
                {
                  name: pick(locale, 'מוזיקה חיה בלובי', 'Live music in the lobby'),
                  price: '20:30',
                  tags: [],
                },
                {
                  name: pick(locale, 'בר הגג', 'Rooftop bar'),
                  price: pick(locale, 'עד 01:00', 'Until 1 am'),
                  tags: [],
                },
              ],
            },
          ],
        })),
      },
      {
        key: 'clock',
        type: 'clock',
        name: L('שעון המלון', 'Hotel clock'),
        config: both((locale) => ({ locale, textColor: '#fdf6e3', background: '#0b1226' })),
      },
      {
        key: 'wifi',
        type: 'qr',
        name: L('Wi-Fi לאורחים', 'Guest Wi-Fi'),
        config: both((locale) => ({
          url: 'https://example.org/wifi',
          label: pick(locale, 'Wi-Fi ושירות לאורחים', 'Guest Wi-Fi and services'),
        })),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('שירותי המלון', 'Hotel services'),
        config: both((locale) => ({
          label: pick(locale, 'לרשותכם', 'For you'),
          text: pick(
            locale,
            'שירות חדרים מסביב לשעון · ספא: הזמנת טיפולים בקבלה · השכרת אופניים בכניסה למלון',
            'Room service around the clock · Spa: book treatments at the reception · Bicycles for rent at the entrance',
          ),
          textColor: '#ffffff',
          background: '#1e293b',
        })),
      },
    ],
    zones: {
      main: {
        playlist: L('מלון — ראשי', 'Hotel — main'),
        widgets: [
          { key: 'welcome', durationMs: 12_000 },
          { key: 'today', durationMs: 15_000 },
        ],
      },
      side: { playlist: L('מלון — צד', 'Hotel — side'), widgets: ['clock', 'wifi'] },
      ticker: { playlist: L('מלון — שירותים', 'Hotel — services'), widgets: ['ticker'] },
    },
  };
};

// ---- Community and school ----------------------------------------------------------------

const community = (): StarterKit => {
  const header = zoneSize('header-main-footer', 'header');
  const main = zoneSize('header-main-footer', 'main');
  return {
    id: 'community',
    template: 'header-main-footer',
    name: L('קהילה ובית ספר — מרכז נווה גן', 'Community and school — Neve Gan Center'),
    background: '#fff7ed',
    widgets: [
      {
        key: 'header',
        type: 'design',
        name: L('כותרת המרכז', 'Center heading'),
        config: both((locale) =>
          design(
            header,
            '#6d28d9',
            [
              text({
                text: pick(locale, 'מרכז קהילתי נווה גן', 'Neve Gan Community Center'),
                x: startX(locale, header.w, 1300, 60),
                y: 25,
                w: 1300,
                h: 100,
                font: locale === 'he' ? 'secular-one' : 'rubik',
                fontSize: 72,
                fontWeight: locale === 'he' ? 400 : 800,
                color: '#ffffff',
                align: 'start',
                ...drop('66'),
                ...enter('slide-down'),
              }),
              text({
                text: pick(locale, 'כאן בשבילכם, כל השבוע', 'Here for you, all week'),
                x: endX(locale, header.w, 500, 60),
                y: 45,
                w: 500,
                h: 60,
                fontSize: 36,
                fontWeight: 600,
                color: '#fce7f3',
                align: 'end',
                ...enter('fade', 400),
              }),
            ],
            {
              backgroundGradient: {
                type: 'linear',
                angle: 90,
                stops: [
                  { color: '#6d28d9', at: 0 },
                  { color: '#be185d', at: 100 },
                ],
              },
            },
          ),
        ),
      },
      {
        key: 'festival',
        type: 'design',
        name: L('פסטיבל משפחות', 'Family festival'),
        config: both((locale) => {
          const x = startX(locale, main.w, 1150, 110);
          return design(
            main,
            '#fff7ed',
            [
              image('balloons', {
                x: endX(locale, main.w, 520, 110),
                y: 120,
                w: 520,
                h: 520,
                ...enter('slide-up', 400, 'float', 1000),
              }),
              text({
                text: pick(locale, 'פסטיבל משפחות', 'Family festival'),
                x,
                y: 140,
                w: 1150,
                h: 170,
                font: headline(locale),
                fontSize: locale === 'he' ? 140 : 170,
                fontWeight: 400,
                lineHeight: 1,
                color: '#4c1d95',
                align: 'start',
                ...enter('zoom'),
              }),
              text({
                text: pick(
                  locale,
                  'שישי 10:00-14:00 · בגינה הקהילתית',
                  'Friday 10 am–2 pm · In the community garden',
                ),
                x,
                y: 340,
                w: 1150,
                h: 70,
                fontSize: 50,
                fontWeight: 600,
                color: '#1f2937',
                align: 'start',
                ...enter('slide-up', 500),
              }),
              text({
                text: pick(
                  locale,
                  'הפעלות, הופעות ודוכני אוכל לכל המשפחה',
                  'Games, shows and food stalls for the whole family',
                ),
                x,
                y: 425,
                w: 1150,
                h: 70,
                fontSize: 42,
                fontWeight: 400,
                color: '#374151',
                align: 'start',
                ...enter('fade', 900),
              }),
              text({
                text: pick(locale, 'הכניסה חופשית', 'Free entry'),
                x: locale === 'he' ? x + 1150 - 380 : x,
                y: 560,
                w: 380,
                h: 92,
                fontSize: 44,
                fontWeight: 800,
                color: '#ffffff',
                background: '#6d28d9',
                radius: 46,
                ...drop('55'),
                ...enter('pop', 1300, 'pulse'),
              }),
            ],
            { backgroundMediaId: 'art:confetti' },
          );
        }),
      },
      {
        key: 'countdown',
        type: 'countdown',
        name: L('עד הפסטיבל', 'Until the festival'),
        config: both((locale) => ({
          title: pick(locale, 'עד פסטיבל המשפחות', 'Until the family festival'),
          target: '2026-12-31T10:00',
          doneText: pick(
            locale,
            'הפסטיבל התחיל — ניפגש בגינה!',
            'The festival has started — see you in the garden!',
          ),
          showSeconds: false,
          locale,
          textColor: '#ffffff',
          background: '#4c1d95',
        })),
      },
      {
        key: 'classes',
        type: 'menu',
        name: L('חוגים השבוע', 'Classes this week'),
        config: both((locale) => ({
          title: pick(locale, 'חוגים השבוע', 'Classes this week'),
          style: 'modern',
          columns: 3,
          currency: 'none',
          locale,
          textColor: '#1f2937',
          background: '#ffffff',
          accent: '#6d28d9',
          sections: [
            {
              title: pick(locale, 'ראשון', 'Sunday'),
              items: [
                {
                  name: pick(locale, 'ציור לילדים', 'Painting for kids'),
                  price: '16:30',
                  tags: [],
                },
                { name: pick(locale, 'פילאטיס', 'Pilates'), price: '19:00', tags: [] },
              ],
            },
            {
              title: pick(locale, 'שני', 'Monday'),
              items: [
                { name: pick(locale, 'רובוטיקה', 'Robotics'), price: '17:00', tags: ['new'] },
                { name: pick(locale, 'מקהלה', 'Choir'), price: '20:00', tags: [] },
              ],
            },
            {
              title: pick(locale, 'שלישי', 'Tuesday'),
              items: [
                { name: pick(locale, 'שחמט', 'Chess'), price: '17:30', tags: [] },
                { name: pick(locale, 'יוגה', 'Yoga'), price: '19:30', tags: ['recommended'] },
              ],
            },
          ],
        })),
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: L('עדכוני המרכז', 'Center updates'),
        config: both((locale) => ({
          label: pick(locale, 'עדכונים', 'Updates'),
          text: pick(
            locale,
            'ההרשמה לחוגי החורף נפתחה · ספריית הקהילה פתוחה גם בשישי · רוצים להתנדב? דברו איתנו בקבלה',
            'Registration for winter classes is open · The community library is now open on Fridays · Want to volunteer? Talk to us at the front desk',
          ),
          textColor: '#ffffff',
          background: '#6d28d9',
        })),
      },
    ],
    zones: {
      header: { playlist: L('קהילה — כותרת', 'Community — heading'), widgets: ['header'] },
      main: {
        playlist: L('קהילה — ראשי', 'Community — main'),
        widgets: [
          { key: 'festival', durationMs: 12_000 },
          'countdown',
          { key: 'classes', durationMs: 15_000 },
        ],
      },
      footer: { playlist: L('קהילה — עדכונים', 'Community — updates'), widgets: ['ticker'] },
    },
  };
};

// ---- Synagogue ---------------------------------------------------------------------------

const synagogue = (): StarterKit => ({
  id: 'synagogue',
  template: 'showcase',
  name: L('בית כנסת — אוהל יעקב', 'Synagogue — Ohel Yaakov'),
  background: '#1c1917',
  widgets: [
    {
      key: 'zmanim',
      type: 'zmanim',
      name: L('זמני היום והתפילות', 'Times and prayers'),
      config: both((locale) => ({
        place:
          locale === 'he'
            ? {
                name: 'ירושלים',
                latitude: 31.76904,
                longitude: 35.21633,
                timezone: 'Asia/Jerusalem',
                israel: true,
              }
            : {
                name: 'New York',
                latitude: 40.71427,
                longitude: -74.00597,
                timezone: 'America/New_York',
                israel: false,
              },
        title: pick(locale, 'בית הכנסת אוהל יעקב', 'Ohel Yaakov Synagogue'),
        times: [
          'alotHaShachar',
          'sunrise',
          'sofZmanShma',
          'sofZmanTfilla',
          'chatzot',
          'minchaGedola',
          'plagHaMincha',
          'sunset',
          'tzeit',
        ],
        // Jerusalem lights 40 minutes before sunset; most places 18.
        candleMinutes: locale === 'he' ? 40 : 18,
        havdalah: 'tzeit',
        prayers: [
          { name: pick(locale, 'שחרית', 'Shacharit'), days: [0, 1, 2, 3, 4, 5], time: '06:30' },
          { name: pick(locale, 'שחרית', 'Shacharit'), days: [6], time: '08:30' },
          {
            name: pick(locale, 'מנחה', 'Mincha'),
            days: [0, 1, 2, 3, 4],
            zman: 'sunset',
            offset: -15,
          },
          {
            name: pick(locale, 'מנחה וקבלת שבת', 'Mincha and Kabbalat Shabbat'),
            days: [5],
            zman: 'sunset',
            offset: -10,
          },
          {
            name: pick(locale, 'ערבית', 'Maariv'),
            days: [0, 1, 2, 3, 4],
            zman: 'tzeit',
            offset: 0,
          },
        ],
        showParasha: true,
        locale,
        format: '24h',
        textColor: '#fdf6e3',
        background: '#1c1917',
        accent: '#d4a017',
      })),
    },
    {
      key: 'clock',
      type: 'clock',
      name: L('שעון', 'Clock'),
      config: both((locale) => ({ locale, textColor: '#fdf6e3', background: '#292524' })),
    },
    {
      key: 'lessons',
      type: 'menu',
      name: L('שיעורים השבוע', "This week's classes"),
      config: both((locale) => ({
        title: pick(locale, 'שיעורים', 'Classes'),
        style: 'classic',
        columns: 1,
        currency: 'none',
        locale,
        textColor: '#fdf6e3',
        background: '#292524',
        accent: '#d4a017',
        sections: [
          {
            title: pick(locale, 'כל ערב', 'Every evening'),
            items: [
              { name: pick(locale, 'דף יומי', 'Daf Yomi'), price: '20:30', tags: [] },
              { name: pick(locale, 'הלכה יומית', 'Daily halacha'), price: '21:30', tags: [] },
            ],
          },
          {
            title: pick(locale, 'שבת', 'Shabbat'),
            items: [
              { name: pick(locale, 'פרשת השבוע', 'Weekly portion'), price: '16:00', tags: [] },
              { name: pick(locale, 'שיעור לנשים', "Women's class"), price: '17:00', tags: [] },
            ],
          },
        ],
      })),
    },
    {
      key: 'ticker',
      type: 'ticker',
      name: L('הודעות לקהל', 'Announcements'),
      config: both((locale) => ({
        label: pick(locale, 'הודעות', 'Notices'),
        text: pick(
          locale,
          'מזל טוב למשפחת לוי להולדת הבת · קידוש לכל הקהל בשבת אחרי התפילה · נא לכבות טלפונים בבית הכנסת',
          'Mazel tov to the Levi family on the birth of a daughter · Kiddush for everyone after services on Shabbat · Please silence phones in the sanctuary',
        ),
        textColor: '#1c1917',
        background: '#d4a017',
      })),
    },
  ],
  zones: {
    main: { playlist: L('בית כנסת — זמנים', 'Synagogue — times'), widgets: ['zmanim'] },
    side: {
      playlist: L('בית כנסת — צד', 'Synagogue — side'),
      widgets: [
        { key: 'clock', durationMs: 10_000 },
        { key: 'lessons', durationMs: 15_000 },
      ],
    },
    ticker: { playlist: L('בית כנסת — הודעות', 'Synagogue — notices'), widgets: ['ticker'] },
  },
});

// ---- Meeting room ------------------------------------------------------------------------

/**
 * The room widget's room until the kit is created: the kit uses the organization's first
 * room, or adds one (see routes.ts).
 */
export const KIT_ROOM_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

const meetingRoom = (): StarterKit => ({
  id: 'meeting-room',
  template: 'main-ticker',
  name: L('חדר ישיבות', 'Meeting room'),
  background: '#0f172a',
  widgets: [
    {
      key: 'room',
      type: 'room',
      name: L('מצב החדר', 'Room status'),
      config: both((locale) => ({
        roomId: KIT_ROOM_PLACEHOLDER,
        allowBooking: true,
        locale,
        format: '24h',
      })),
    },
    {
      key: 'ticker',
      type: 'ticker',
      name: L('הודעות לחדר', 'Room notices'),
      config: both((locale) => ({
        label: pick(locale, 'לתשומת לבכם', 'Please note'),
        text: pick(
          locale,
          'אפשר להזמין את החדר במגע במסך, עם הקוד של הארגון · נא להשאיר את החדר מסודר · השלט של המסך במגירה',
          'Book this room by touching the screen, with your organization’s code · Please leave the room tidy · The screen remote is in the drawer',
        ),
        textColor: '#ffffff',
        background: '#1e3a8a',
      })),
    },
  ],
  zones: {
    main: { playlist: L('חדר ישיבות — מצב', 'Meeting room — status'), widgets: ['room'] },
    ticker: { playlist: L('חדר ישיבות — הודעות', 'Meeting room — notices'), widgets: ['ticker'] },
  },
});

export const INDUSTRY_KITS: readonly StarterKit[] = [
  restaurant(),
  cafe(),
  cinema(),
  retail(),
  office(),
  hotel(),
  community(),
  synagogue(),
  meetingRoom(),
];
