<div dir="rtl">

# Rubinny

**שילוט דיגיטלי חינמי בקוד פתוח.** ניהול מסכים, מדיה, פלייליסטים, תבניות תצוגה ותזמונים מלוח ניהול אחד.
אירוח עצמי, נגן שעובד גם בלי אינטרנט, ותמיכה מובנית בעברית, RTL ונגישות.
רץ על כל מכשיר עם דפדפן מודרני: Raspberry Pi, Windows, Linux, Android, Android TV ו-Fire TV. תמיכה ב-Samsung Tizen וב-LG webOS מתוכננת.

> **סטטוס: פיתוח מוקדם (שלב 4 מתוך 9 הושלם: ספריית מדיה מאובטחת, פלייליסטים, חיבור מסכים בקוד ונגן שעובד גם בלי אינטרנט).** עדיין לא מוכן לפרודקשן.

## התקנה מהירה (Docker)

</div>

```bash
git clone https://github.com/diamondrubinny/freescreensign.git rubinny
cd rubinny/deploy
./generate-env.sh
docker compose up -d --build
curl -k https://localhost/health
```

<div dir="rtl">

## מסמכים

- [אפיון ו-Roadmap](docs/PLAN.md)
- [שלב 1 — Foundation](docs/phases/01-foundation.md)
- [תרומה לפרויקט](CONTRIBUTING.md) · [אבטחה](SECURITY.md) · [רישוי](LICENSING.md)

## רישיון

AGPL-3.0, עם חובה לשמור את הקרדיט "Powered by Rubinny". חבילות ה-SDK ברישיון MIT.

</div>
