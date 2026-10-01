# בדיקות קצה-לקצה (Playwright, פייתון)

הרצה: `python3 -m http.server 8765` ברקע, ואז `python3 tests/e2e/<script>.py`.
הדפדפן: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (בקונטיינר). צילומי מסך נכתבים ל-/tmp.

- `smoke_all_screens.py`: כל המסכים וכל לשוניות התיק, 400px ו-1280px, he/fr/en. חייב להדפיס "errors: none".
- `workgroup_and_invoice.py`: קבוצת עבודה בקול (כרטיס, "וואטסאפ", "תוסיפי את", משימות, לשונית בתיק) + חשבונית ללקוח חדש.
- `invoice_new_client.py`: שאלת "לקוח חדש" אחרי "במייל לרועי".
- `send_document.py`: "שלחי את X לרועי" (מסמך חסר, לוגו, תעודת התאגדות).
- `split_done.py`: "סיימתי" באמצע הקלטה = שתי פקודות; לשוניות המשימות; צ'יפים של הצוות.
