# krato

AI agent that scans ur live web app nd finds whats broken. buttons, forms, console errors, 500s, all that.

live: kratoai.vercel.app

## what it does

give it a url, it crawls a few pages n gives u actual bugs not vague stuff. exact endpoint, status code, repro steps.

4 scan modes:
- happy path - normal browsing
- edge case - garbage data in forms, finds validation bugs
- adversarial - rapid clicks, double submits
- security - basic xss checks, not a full pentest

also does linear tickets, public report links, pdf export, scan history

## stack

next.js 16, supabase, playwright, groq for ai, vercel

## running locally

npm install
npm run dev


need ur own .env.local w supabase/groq/linear keys

## why

im 15, been building ai stuff solo for a year+, kept shipping bugs n only finding out when someone comlpained- figured other solo devs have same problem so built this

## status

still building, adding auto journey discovery next so u dont have to tell it what to test(kinda cool)