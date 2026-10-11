# AquaShield AI (Track 02: Heat and Water)
Explainable heat, flood, drought and leak monitoring that turns warnings into tracked actions.

## Run (two terminals, Node 18+)
    cd server && npm install && npm start      # API on http://localhost:5050
    cd client && npm install && npm run dev    # App on http://localhost:5173

## Demo story
Dashboard: search any Indian city for live weather and safety guidance. The selected city is shared with Sample risks, Risk map, Report, and Action center. Sample risks scores remain simulated; its scenarios include A-C for heat, flood, and drought, and D for leak reporting. The map and Action center focus on reports within 50 km; Action center can show all reports. Assign and resolve a leak with L/min and hours avoided to see the Water saved tracker. Try Report (duplicates merge), What-if, and Assistant for forecast-based guidance.

## Honesty notes
Dashboard readings are simulated sample scenarios. The Assistant uses live Open-Meteo geocoding and forecast APIs (no API key required) with rule-based safety guidance; it is not a generative AI model. Weather forecasts do not confirm local water supply, drinking-water quality, or official alerts. The risk rules are simple and unvalidated. Combined AquaScore never hides a severe single hazard; missing inputs are excluded and shown, not treated as zero.

## Deploy on AWS (needed for prize eligibility)
Server: `server/Dockerfile` on AWS App Runner (set ORIGIN to your site). Client: `npm run build`, host `client/dist` on S3 + CloudFront or Amplify, and point `/api` to the App Runner URL.

## Report email notifications
Reports are saved even if email delivery is unavailable. To send notifications, verify `SES_FROM_EMAIL` in Amazon SES, set `AWS_REGION`, `SES_FROM_EMAIL`, and `REPORT_EMAIL_TO` in the server environment, and grant the App Runner instance role `ses:SendEmail` permission. The recipient defaults to the project owner's configured address above. SES sandbox accounts must also verify the recipient or be moved out of the sandbox. For local runs, provide AWS credentials through the standard AWS SDK credential chain before starting the server. The Report screen confirms whether email delivery succeeded.

## Not included yet
Login/roles, MongoDB (incidents are in memory and reset on restart), Python ML service, uploads, sensor integrations, and automated tests.
