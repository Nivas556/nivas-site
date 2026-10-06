# Nivas Mission Control — real-time UPSC site

Express + Socket.IO. Password login, notes with PDF/image attachments, study hours (day/week/month),
expenses, syllabus tracker, animated space background. Every open device updates live.

## Run on your computer
    npm install
    APP_PASSWORD=yourSecret npm start        # Windows PowerShell: $env:APP_PASSWORD="yourSecret"; npm start
Open http://localhost:3000 (same Wi-Fi: http://<your-computer-ip>:3000 on your phone).

## Put it online (any device, any network)
Use a host that gives you a persistent disk, otherwise your data resets on every deploy.
1. Push this folder to a private GitHub repo (node_modules and data are git-ignored).
2. Create a Web Service on Render / Railway / Fly.io from the repo.
   Build: `npm install` · Start: `npm start`
3. Set environment variables:
   - `APP_PASSWORD` = a strong password (required)
   - `DATA_DIR` = path of the mounted persistent disk, e.g. `/var/data`
4. Attach a persistent disk/volume at that path. The host gives you an https URL — open it on any device.

All data lives in `DATA_DIR`: `db.json` (logs, expenses, notes, topics) and `uploads/` (attachments).
Back it up by copying that folder.
