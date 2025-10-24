# Coaching KSB Self-Assessment — Local web app

Small single-page app to self-assess coaching Knowledge, Skills and Behaviours (KSB). Data stays in your browser (localStorage). You can save, load, export CSV and generate a starter development plan.

Files added
- `index.html` — main page (open in browser)
- `styles.css` — simple styles
- `data.js` — list of items (K1-K12, S1-S15, B1-B4)
- `app.js` — app logic (rendering, save/load, export, summary)

How to run
1. Open `index.html` in your browser (double-click or right-click -> Open with…).
2. Rate each item 1 to 5, optionally add notes.
3. Use the buttons to Save progress (localStorage), Load, Clear, Export CSV, or Show summary & plan.

Notes & next steps
- This is a minimal, local-only app intended for quick self-assessment and reflection.
- Possible enhancements: persistent server storage, user accounts, more detailed development actions, printable reports, import of previous data, tests.

Privacy
- All saved data is stored in your browser's localStorage. No data leaves your machine unless you export and share it.
