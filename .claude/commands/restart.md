Restart the Clinical Trial Navigator dev servers (backend + frontend).

Steps:
1. Kill any existing processes on ports 8100 (backend) and 3000 (frontend):
   - `fuser -k 8100/tcp 2>/dev/null; fuser -k 3000/tcp 2>/dev/null`
   - Wait 2 seconds for ports to free up

2. Remove the Next.js dev lock file if it exists (prevents "Unable to acquire lock" errors):
   - `rm -f /home/j/Documents/git/clinical-trial-copilot/frontend/.next/dev/lock`

3. Start the backend server in the background from the project root:
   - Working directory: `/home/j/Documents/git/clinical-trial-copilot`
   - There is no virtualenv — dependencies are installed in the base conda environment
   - Command: `uvicorn backend.main:app --reload --port 8100 2>&1`
   - Run in background

4. Start the frontend server in the background:
   - Working directory: `/home/j/Documents/git/clinical-trial-copilot/frontend`
   - Command: `npx next dev --port 3000 2>&1`
   - Run in background

5. Wait 5 seconds, then verify both servers are responding with retries:
   - Try up to 3 times with 3-second gaps:
     - `curl -s -o /dev/null -w '%{http_code}' http://localhost:8100/health` should return 200
     - `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000` should return 200

6. If either server fails health check after retries, read its background task output to diagnose the issue. Common problems:
   - Port still in use: re-run `fuser -k` and retry
   - Next.js lock file: remove `.next/dev/lock`
   - Missing dependencies: run `pip install -e .` or `npm install`

7. Report the results:
   - If both return 200: "Servers running: backend http://localhost:8100, frontend http://localhost:3000"
   - If either fails: report which server failed and show relevant error output
