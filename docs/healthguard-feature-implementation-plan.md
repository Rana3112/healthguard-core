# HealthGuard Feature Implementation Plan

This plan is scoped to the Android app first. The web app can continue to share React code, but secrets, paid APIs, and Android-only features must be wired through the backend or Capacitor plugins.

## Product Priority

1. Smart Medicine Cabinet
2. Google Places Medical Finder
3. Health Memory Timeline
4. AI Visit Prep PDF
5. Report Scanner
6. Family/Caregiver Mode
7. Offline reminders

## Shared Architecture

### Local-First Health Store

Create one typed local store for all user health records:

- `medicines`: active/inactive medicines, dosage, instructions, stock, refill dates, source, and notes.
- `medicine_reminders`: scheduled medicine reminders linked to medicines.
- `timeline_events`: normalized history for vitals, medicine changes, reminders, report scans, location searches, visit prep exports, and AI summaries.
- `reports`: metadata and extracted values from medical reports.
- `visit_prep`: generated doctor-visit summaries and PDFs.
- `family_members`: user profiles for self, parents, children, or caregivers.

Initial persistence: `localStorage`, because the current app already stores vitals, chat history, notifications, and fitness plan history this way. Later sync can move behind the same repository API using Firebase/Firestore or the Flask backend.

### Backend Responsibilities

The backend should own anything that needs a private key or server-side reliability:

- Google Places and Geocoding API calls.
- Resend email notifications.
- SerpAPI medicine shopping search.
- AI report extraction if using server-side model keys.
- Optional PDF generation if Android file sharing becomes unreliable.

The Android app should never contain unrestricted Google Places, Resend, SerpAPI, or production LLM keys.

### Timeline as the Integration Layer

Every major user action should append a timeline event:

- Added medicine.
- Changed dosage.
- Reminder created or completed.
- Vitals recorded.
- Report scanned.
- Nearby facility searched.
- Visit prep generated.
- Caregiver update shared.

This makes the app feel intelligent without forcing every feature to query chat history.

## API and Model Usage

### No AI Model Needed

- Medicine cabinet CRUD.
- Stock/refill tracking.
- Offline reminders.
- Family member CRUD.
- Timeline filtering/searching.
- Google Places fetching.

### Backend APIs Needed

- `POST /search-medicine`: already deployed for Indian medicine shopping results.
- `POST /api/nearby-medical`: already added, but Google billing must be enabled before it can return Google Places results.
- `POST /api/general-reminder`: already deployed for email-backed reminders.
- `POST /api/email/medicine-reminder`: already deployed for immediate Resend medicine email.
- New later endpoint: `POST /api/report/analyze` for report image/PDF extraction.
- New later endpoint: `POST /api/visit-prep` for server-side summary generation if browser/mobile model keys are removed.

### Model Choices

- Report Scanner: Gemini 2.5 Flash vision or equivalent multimodal model. It should return strict JSON with extracted lab values, abnormal flags, units, date, patient name if visible, and a plain-language summary.
- AI Visit Prep PDF: text model such as Gemini 2.5 Flash, Groq Llama, or OpenRouter GPT-OSS-120B. It should use only local timeline, medicines, vitals, reports, and user-provided notes.
- Medicine explanation and interaction checks: current OpenRouter GPT-OSS-120B flow can continue, but final UI must frame output as guidance and ask the user to consult a clinician for dosing changes.
- Google Places Medical Finder: no LLM required for search. A model can optionally rewrite vague queries like "skin doctor" into "dermatologist", but deterministic mapping should be the default.

## Feature Plans

### 1. Smart Medicine Cabinet

Build a dedicated cabinet layer that stores medicines independent of chat messages.

Needed:

- Add/edit medicine form.
- Medicine list grouped by active, paused, completed.
- Dosage, strength, frequency, instructions, prescriber, start/end date, refill date, stock count.
- Actions: set reminder, check interactions, search prices, add note, mark taken.
- Timeline events for add/edit/taken/refill/reminder actions.

First implementation slice:

- Typed store and helper APIs.
- Basic local medicine add/update/delete functions.
- Cabinet UI entry from the right panel or health tools area.

### 2. Google Places Medical Finder

Current state:

- Frontend map exists with Leaflet/OpenStreetMap fallback.
- Backend route `/api/nearby-medical` exists and uses Google Places when `GOOGLE_MAPS_API_KEY` is set.
- Google billing is not enabled, so Google results currently fail and fallback should remain active.

Needed after billing:

- Keep the key restricted to EC2 IP and Places/Geocoding APIs.
- Improve query mapping for hospitals, pharmacies, labs, dentists, specialists, emergency care.
- Show distance, rating, open status, phone, address, directions link.
- Add timeline event when a user searches.

No model required.

### 3. Health Memory Timeline

Build a unified view over existing and new data.

Needed:

- Merge existing vitals from `healthguard_vitals`.
- Merge medicine cabinet events.
- Merge report scanner events.
- Merge reminder events.
- Filters by member, category, date, severity.
- Search by medicine, symptom, report marker, doctor, place.

First implementation slice:

- Data model and selectors.
- Timeline append helper.
- Backfill adapter for existing vitals.

### 4. AI Visit Prep PDF

Create a doctor-ready summary from local data.

Needed:

- User selects family member, date range, visit reason, doctor/specialty.
- App gathers current medicines, recent vitals, reports, allergies, symptoms, reminders, and notes.
- AI produces structured visit prep:
  - One-page summary.
  - Current medicines.
  - Timeline highlights.
  - Abnormal vitals/labs.
  - Questions to ask the doctor.
  - Red flags to mention.
- `jsPDF` creates downloadable/shareable PDF.

Model needed:

- Text LLM via existing Groq/OpenRouter/Gemini setup.
- Prefer backend endpoint later to avoid exposing model keys.

### 5. Report Scanner

Let user scan/upload lab reports, prescriptions, and discharge summaries.

Needed:

- Camera/file upload UI.
- OCR/extraction prompt with strict JSON output.
- Store original metadata and extracted values.
- Highlight abnormal markers.
- Add report summary to timeline.
- Optionally add detected medicines to Smart Medicine Cabinet.

Model needed:

- Gemini 2.5 Flash vision or equivalent multimodal model.
- Backend endpoint preferred for production.

### 6. Family/Caregiver Mode

Support multiple people inside the same app.

Needed:

- Default `self` member.
- Add member: name, relation, age, sex, conditions, allergies, emergency contact.
- Scope medicine cabinet, reports, reminders, timeline, and visit prep by member.
- Caregiver dashboard: "who needs attention today".
- Later: share selected PDF/report summary over email or WhatsApp/manual share.

No model required for core feature.

### 7. Offline Reminders

Current state:

- Settings panel checks medicine reminder times in JavaScript while the app is open.
- Backend can send emails via Resend.
- This does not guarantee Android notifications when the app is closed.

Needed:

- Add `@capacitor/local-notifications`.
- Request Android notification permission.
- Schedule local notifications for medicine reminders.
- Keep backend email reminders as optional backup.
- Store scheduled notification IDs in local health store.

No model required.

## Implementation Order

### Phase A: Foundation

1. Add typed health data store.
2. Add timeline append/select helpers.
3. Add default family member.
4. Add selectors for current medicines, upcoming reminders, and timeline.

### Phase B: Smart Medicine Cabinet

1. Build cabinet UI.
2. Add medicine form.
3. Link cabinet to interaction checker and medicine search.
4. Write timeline events.

### Phase C: Timeline

1. Add timeline panel.
2. Backfill vitals into timeline view.
3. Add filters and search.

### Phase D: Offline Reminders

1. Add Capacitor Local Notifications.
2. Schedule/cancel reminders from the cabinet.
3. Keep email reminders as fallback.

### Phase E: Google Places Upgrade

1. Wait for Google billing.
2. Verify backend route on EC2.
3. Improve UI details and timeline logging.

### Phase F: Visit Prep PDF

1. Add summary generator service.
2. Generate PDF with `jsPDF`.
3. Save visit prep event.

### Phase G: Report Scanner

1. Add report upload/scan flow.
2. Add backend vision extraction.
3. Persist results and timeline events.

## Safety Rules

- The app must not diagnose emergencies as safe.
- Medicine dose changes must say "confirm with your doctor/pharmacist".
- AI report extraction must show confidence and "verify against original report".
- Caregiver sharing must require explicit user action.
- API keys must stay out of committed frontend code.
