# HealthGuard AI Architecture Graph

Generated from the repository source on 2026-04-25.

## System Context

```mermaid
flowchart LR
  User[User] --> Client[React + Vite app]
  Client --> Web[Web browser]
  Client --> Android[Capacitor Android shell]

  Client --> Firebase[Firebase Auth]
  Client --> Backend[Flask backend server.py]
  Client --> LocalStorage[(Browser localStorage)]

  Backend --> Mongo[(MongoDB chat store)]
  Backend --> Reminders[Reminder scheduler and /tmp/reminders.json]
  Backend --> ExerciseDb[(backend/data/exercises.json)]
  Backend --> SerpAPI[Medicine search provider]
  Backend --> Groq[Groq chat completions]
  Backend --> OpenRouter[OpenRouter chat completions]
  Backend --> Nvidia[NVIDIA hosted inference]
  Backend --> Twilio[Twilio WhatsApp]
  Backend --> Email[SMTP email]

  Client --> Gemini[Google Gemini API]
  Client --> GroqDirect[Groq direct API]
  Client --> OpenRouterDirect[OpenRouter direct API]
  Client --> Bytez[Bytez image/video APIs]
  Client --> Overpass[Overpass pharmacy lookup]
```

## Frontend Shell

```mermaid
flowchart TD
  Index[src/index.tsx] --> App[src/App.tsx]
  App --> AuthProvider[src/context/AuthContext.tsx]
  App --> Router[React Router]

  Router --> Landing[src/pages/LandingPage.tsx]
  Router --> Login[src/pages/AuthPage.tsx]
  Router --> Protected[src/components/ProtectedRoute.tsx]
  Protected --> Dashboard[src/pages/Dashboard.tsx]

  Dashboard --> Sidebar[components/Sidebar.tsx]
  Dashboard --> Chat[components/TextChatInterface.tsx]
  Dashboard --> Voice[components/LiveVoiceInterface.tsx]
  Dashboard --> Fitness[components/FitnessPanel.tsx]
  Dashboard --> Vitals[components/HealthDashboard.tsx]
  Dashboard --> Drugs[components/DrugInteractionChecker.tsx]
  Dashboard --> Activity[components/AgentActivityMonitor.tsx]
  Dashboard --> Settings[components/SettingsPanel.tsx]
  Dashboard --> Notifications[components/NotificationPanel.tsx]
  Dashboard --> Permissions[components/PermissionPrompt.tsx]

  Sidebar --> ChatHistory[hooks/useChatHistory.ts]
  ChatHistory --> ChatApi["/api/chats user endpoints"]
  ChatHistory --> ChatCache[(localStorage healthguard_chat_history)]

  Vitals --> VitalsStore[(localStorage healthguard_vitals)]
  Vitals --> VitalsRag[services/vitalsRAG.ts]
  Notifications --> ReminderApi["/api/reminder endpoints"]
```

## Chat And Clinical AI Flow

```mermaid
flowchart TD
  Chat[TextChatInterface] --> VitalsContext[retrieveVitalsContext]
  Chat --> ModeSwitch{selected model mode}

  ModeSwitch --> Fast[fast: Groq Llama 3.1]
  ModeSwitch --> Standard[standard: Gemini / Groq standard path]
  ModeSwitch --> Thinking[thinking: OpenRouter GPT-OSS]
  ModeSwitch --> MaxDeepThink[max_deep_think: backend NVIDIA proxy]
  ModeSwitch --> Vision[vision: Gemini image analysis]
  ModeSwitch --> Agent[agent: medicine/location/reminder tools]
  ModeSwitch --> Image[image: backend image generation]

  Chat --> ClinicalGraph[src/agents/clinicalGraph.ts]
  ClinicalGraph --> Intent[intent_classifier]
  Intent --> Gather[information_gathering]
  Gather --> Route{routing_check}
  Route -->|awaiting answer| Pause[return clarification card]
  Route -->|need more| Gather
  Route -->|ready| Abstraction[clinical abstraction]
  Abstraction --> MedicalSearch[medical search prompt]
  MedicalSearch --> Diagnosis[diagnosis formulation]
  Diagnosis --> Final[structured diagnosis response]

  Agent --> MedicineSearch["/search-medicine"]
  Agent --> GeneralReminder["/api/general-reminder"]
  Agent --> PharmacyMap[NearbyPharmacyMap + Overpass]
  Vision --> GeminiApi[Google Gemini API]
  Fast --> GroqApi[Groq API]
  Thinking --> OpenRouterApi[OpenRouter API]
  MaxDeepThink --> NvidiaProxy["/api/nvidia-deepthink"]
  Image --> ImageEndpoint["/generate-image"]
```

## Fitness And Exercise Flow

```mermaid
flowchart TD
  Fitness[FitnessPanel] --> BackendUrl[getBackendUrl]
  Fitness --> MuscleList["/muscles"]
  Fitness --> CategoryList["/categories"]
  Fitness --> ExerciseFilter["/exercises?muscle=&equipment="]
  Fitness --> Workout["/generate_workout"]
  Fitness --> Coach["/coach/chat"]
  Fitness --> ExerciseSearch["/api/search-exercises"]

  MuscleList --> LocalExerciseDb[(backend/data/exercises.json)]
  CategoryList --> LocalExerciseDb
  ExerciseFilter --> LocalExerciseDb
  ExerciseSearch --> LocalExerciseDb
  Workout --> GroqBackend[Groq API through Flask]
  Workout --> LocalExerciseDb
  Coach --> OpenRouterBackend[OpenRouter through Flask]
  Coach --> LocalExerciseDb

  Fitness --> BundledFallback[src/lib/localExerciseDb.ts]
  BundledFallback --> BundledJson[(same exercises.json bundled by Vite)]
  Fitness --> PlanHistory[(localStorage fitness_plan_history)]
  Fitness --> PdfExport[jsPDF + autotable]
```

## Backend API Graph

```mermaid
flowchart LR
  Flask[Flask app in backend/server.py] --> Health["/ and /health"]
  Flask --> Medicine["/search-medicine and /api/android/search-medicine"]
  Flask --> AutoOrder["/auto-order SSE"]
  Flask --> ExerciseRoutes["/muscles /categories /exercises /api/search-exercises"]
  Flask --> WorkoutRoutes["/generate_workout /coach/chat"]
  Flask --> Transcribe["/api/transcribe"]
  Flask --> ChatRoutes["/api/chats user endpoints"]
  Flask --> Interaction["/check-interactions"]
  Flask --> DeepThink["/api/openai-deepthink /api/nvidia-deepthink"]
  Flask --> Payments["/api/create-checkout-session /api/stripe-webhook /api/user-status"]
  Flask --> ReminderRoutes["/api/reminder and /api/general-reminder"]
  Flask --> ImageGeneration["/generate-image"]

  Medicine --> AgentBrowser[backend/agent_browser.py]
  AgentBrowser --> SearchProvider[medicine search provider]
  AutoOrder --> BrowserAgent[backend/browser_agent.py]
  ExerciseRoutes --> ExerciseJson[(backend/data/exercises.json)]
  WorkoutRoutes --> ExerciseJson
  WorkoutRoutes --> Groq[Groq API]
  WorkoutRoutes --> OpenRouter[OpenRouter API]
  Transcribe --> NvidiaWhisper[NVIDIA Whisper]
  ChatRoutes --> Mongo[(MongoDB)]
  Interaction --> OpenRouter
  DeepThink --> OpenAI[OpenAI API]
  DeepThink --> Nvidia[NVIDIA Kimi endpoint]
  ReminderRoutes --> ReminderFile[reminders.json]
  ReminderRoutes --> Email[SMTP]
  ReminderRoutes --> Twilio[Twilio]
  ImageGeneration --> BytezOrProvider[image generation provider]
```

## Persistence And Configuration

```mermaid
flowchart TD
  Env[Environment variables] --> ViteDefine[vite.config.ts process.env defines]
  Env --> BackendRuntime[backend/server.py os.getenv]
  Env --> BackendUrl[src/lib/backendUrl.ts]

  BackendUrl --> Shared[VITE_BACKEND_URL]
  BackendUrl --> Android[VITE_ANDROID_BACKEND_URL]
  BackendUrl --> Railway[Railway fallback]
  BackendUrl --> OpenShift[OpenShift fallback]
  BackendUrl --> Local[localhost:5001 fallback]

  Auth[Firebase auth state] --> AuthContext[src/context/AuthContext.tsx]
  AuthContext --> ProtectedRoute[src/components/ProtectedRoute.tsx]
  AuthContext --> ChatHistory[hooks/useChatHistory.ts]

  ChatHistory --> RemoteChat[remote /api/chats]
  ChatHistory --> LocalChat[(localStorage per user)]
  Vitals[HealthDashboard] --> LocalVitals[(localStorage healthguard_vitals)]
  Vitals --> VitalsRag[services/vitalsRAG.ts]
  Settings[SettingsPanel] --> NotificationSettings[(localStorage notification settings)]
  Fitness[FitnessPanel] --> FitnessHistory[(localStorage fitness_plan_history)]
```

## Notes

- The active slash workflows in `.agent/workflows` do not include `/graphify`; this file is the repository architecture graph equivalent.
- Most frontend-to-backend calls use `src/lib/backendUrl.ts`. `hooks/useChatHistory.ts` has its own `API_BASE` fallback to the Render backend.
- The app mixes top-level folders such as `components/`, `services/`, `hooks/`, and `utils/` with `src/` folders. `vite.config.ts` aliases `@` to the repository root, so imports can cross both roots.
- The clinical flow is a real LangGraph state machine in `src/agents/clinicalGraph.ts`, while the broader chat UI still routes directly through service functions for specific modes and tools.
