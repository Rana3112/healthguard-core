# HealthGuard AI — Clinical Reasoning Engine Migration Plan
## Single-Prompt LLM → Multi-Agent LangGraph Workflow (TypeScript, Option B)

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Architecture Decisions & Rationale](#2-architecture-decisions--rationale)
3. [Gap Analysis: What the Original Plan Was Missing](#3-gap-analysis-what-the-original-plan-was-missing)
4. [Complete File Change Manifest](#4-complete-file-change-manifest)
5. [State Schema Specification](#5-state-schema-specification)
6. [LangGraph Node & Edge Specification](#6-langgraph-node--edge-specification)
7. [Human-in-the-Loop: Interrupt Strategy](#7-human-in-the-loop-interrupt-strategy)
8. [Security: API Key Handling](#8-security-api-key-handling)
9. [Streaming Strategy](#9-streaming-strategy)
10. [Updated Dependencies](#10-updated-dependencies)
11. [Environment Setup](#11-environment-setup)
12. [Migration Strategy for Existing Code](#12-migration-strategy-for-existing-code)
13. [Error Handling & Retry Strategy](#13-error-handling--retry-strategy)
14. [Verification Plan (Expanded)](#14-verification-plan-expanded)

---

## 1. Overview & Goals

Migrate HealthGuard AI's clinical reasoning engine from a single monolithic LLM prompt to a
multi-agent LangGraph.js workflow. The workflow systematically gathers patient information
using the **SOCRATES clinical interview framework** (Site, Onset, Character, Radiation,
Associations, Timing, Exacerbating/Relieving factors, Severity), performs clinical
abstraction, queries a medical knowledge source, and formulates a structured differential
diagnosis — all via independent, collaborative AI nodes.

### Implementation Choice

**Option B — Pure TypeScript LangGraph.js.** No separate Python service. The LangGraph
state machine runs inside the Next.js/React client environment using `@langchain/langgraph`
and `@langchain/google-genai`. This eliminates backend infrastructure overhead while
providing the same graph capabilities.

> ⚠️ **Security caveat (see Section 8):** Because LangGraph runs client-side, the Gemini
> API key will be exposed in the browser bundle. A Next.js API Route proxy is required for
> any production or public deployment. Section 8 covers this in full.

---

## 2. Architecture Decisions & Rationale

| Decision | Rationale |
|---|---|
| LangGraph.js (not Python) | Avoids separate service; ships with the existing Next.js bundle |
| `MemorySaver` checkpointer | Required for multi-turn conversation; without it the graph loses state between user replies |
| `interrupt()` for human-in-the-loop | Information-gathering node must pause mid-graph and wait for user input before continuing |
| SOCRATES framework as state schema | Industry-standard clinical interview structure; ensures all medically relevant fields are systematically covered |
| `conditional_edges` on router node | Enables dynamic branching — the graph routes to more questions or to diagnosis based on completeness of SOCRATES fields |
| Next.js API Route proxy (production) | Prevents Gemini API key exposure in the client bundle |
| `gemini-1.5-pro` model | Best available via `@langchain/google-genai`; supports long context needed for multi-turn clinical history |

---

## 3. Gap Analysis: What the Original Plan Was Missing

The following issues would cause build failures, runtime errors, or incorrect behavior
if the original plan had been implemented as written.

### Gap 1 — No State Schema Defined
The original plan listed state *field names* (`messages`, `clinical_abstraction`,
`search_results`, `final_diagnosis`) but did not define the full TypeScript interface,
including the SOCRATES sub-object, session ID, graph phase, or the `nextCard` field that
drives the flashcard UI. Without a typed schema, `StateGraph` cannot be compiled.
**→ Fixed in Section 5.**

### Gap 2 — No Checkpointer / Session Strategy
The plan said nothing about how graph state persists between user messages. In a multi-turn
conversation, each user reply is a new event. Without a `MemorySaver` checkpointer and a
stable `thread_id`, the graph resets to the beginning on every message.
**→ Fixed in Section 7.**

### Gap 3 — No `interrupt()` / Human-in-the-Loop Mechanism
The `information_gathering_node` was described as "interact with the user" with no
specification of *how* the graph pauses to wait for user input. LangGraph.js requires
an explicit `interrupt()` call (or `interruptAfter` config) to suspend execution at a node
and resume after the user replies. Without this, the graph would run all nodes in one shot
and never actually wait for patient answers.
**→ Fixed in Section 7.**

### Gap 4 — No Conditional Edge Specification
The plan listed four nodes but did not specify the conditional routing logic between them.
Key questions left unanswered: How many questions must be asked before moving to
abstraction? Which SOCRATES fields are required vs optional? What condition causes the
graph to stop gathering and proceed to diagnosis?
**→ Fixed in Section 6.**

### Gap 5 — `medical_search_node` Is Undefined**
The plan described this node as "simulate searching a medical database or formulating a
query." This is ambiguous: is it a mock, a vector store lookup, a Tavily web search, or a
static knowledge base? An undefined node cannot be implemented consistently.
**→ Clarified in Section 6: the node uses a structured prompt with the Gemini model to
perform knowledge retrieval simulation with a clearly defined output schema. A real search
integration (Tavily/MedlinePlus) is listed as a future enhancement.**

### Gap 6 — API Key Security Not Addressed
The plan said to use `VITE_` environment variables to pass the Gemini key to the client.
`VITE_` variables are inlined into the browser bundle at build time, making the API key
publicly visible to anyone who inspects the JavaScript. This is a critical security issue
for any deployment beyond local development.
**→ Fixed in Section 8: a Next.js API Route proxy is specified for production.**

### Gap 7 — `followUpGenerator.ts` Changes Underspecified
The plan said to "adapt clarification card generation to work alongside the new graph
output" without explaining what the new trigger mechanism looks like, what the new function
signature is, or how the graph communicates to the UI that a flashcard is needed.
**→ Fixed in Section 6 (node output schema) and Section 4 (file change manifest).**

### Gap 8 — `types.ts` Not Listed as a Modified File
The new graph introduces new card types (`"final_summary"`, `"red_flag"`), a new
`PatientState` interface, and updated `ClinicalCard` fields. None of these were captured in
the original file change manifest.
**→ Fixed in Section 4.**

### Gap 9 — Verification Plan Too Thin
The plan specified only `npm run build` and a single happy-path manual test. It had no
edge cases, no tests for graph branching, no error scenario testing, and no check that
session continuity works across multiple messages.
**→ Fixed in Section 14.**

---

## 4. Complete File Change Manifest

### New Files

| File | Purpose |
|---|---|
| `src/agents/clinicalGraph.ts` | LangGraph `StateGraph` definition, all nodes, edges, and compiled graph export |
| `src/agents/patientSession.ts` | Session store: maps `thread_id` → `MemorySaver` checkpointer instances |
| `src/agents/medicalKnowledgePrompts.ts` | Prompt templates for each clinical node, separated from graph logic |
| `src/app/api/clinical/route.ts` | Next.js API Route proxy that holds the Gemini key server-side (production security) |

### Modified Files

| File | Change Summary |
|---|---|
| `src/types.ts` | Add `PatientState`, `SocratesObject`, `ClinicalCard` (extended), `GraphPhase`, `CardInputType` |
| `src/components/TextChatInterface.tsx` | Replace `getGeminiChatResponse` with `runClinicalGraph`; handle interrupt resume flow; render graph-driven flashcards |
| `src/components/FitnessPanel.tsx` | Update coach chat to use graph output for flashcard trigger signals (maintains parity with TextChatInterface) |
| `src/services/followUpGenerator.ts` | Remove hardcoded heuristic fallback; new `generateCardFromGraphSignal(signal)` function that reads graph node output |
| `package.json` | Add three new dependencies with pinned versions (see Section 10) |
| `.env.local` | Add `GEMINI_API_KEY` (server-side, no `VITE_` prefix) for production proxy |
| `.env.local` (dev) | Keep `VITE_GEMINI_API_KEY` for local dev direct-call only, documented as dev-only |

---

## 5. State Schema Specification

The LangGraph state is the source of truth for the entire conversation. Define this in
`src/types.ts` before writing any graph code.

```typescript
// src/types.ts — additions

export type GraphPhase =
  | "intake"          // first message, extracting chief complaint
  | "gathering"       // asking SOCRATES questions
  | "abstraction"     // extracting structured clinical picture
  | "searching"       // querying knowledge base
  | "diagnosis"       // formulating differential
  | "complete";       // final card delivered

export type CardInputType = "options" | "text" | "final_summary" | "red_flag";

export interface SocratesObject {
  site: string | null;
  onset: string | null;
  character: string | null;
  radiation: string | null;
  associations: string | null;
  timing: string | null;
  exacerbating: string | null;
  relieving: string | null;
  severity: string | null;
  // Extended fields
  medications: string | null;
  allergies: string | null;
  medical_history: string | null;
  age_sex: string | null;
}

export interface ClinicalCard {
  question: string;
  inputType: CardInputType;
  placeholder?: string;
  options?: string[];
  socrates_field?: keyof SocratesObject;
  reasoning?: string;         // why this question was chosen (debug/logging)
}

export interface PatientState {
  // LangGraph message history (append-only via add_messages reducer)
  messages: BaseMessage[];

  // Clinical data
  chief_complaint: string;
  socrates: SocratesObject;
  questions_asked: string[];
  answers_given: Record<string, string>;   // { question_text: answer }

  // Graph control
  phase: GraphPhase;
  thread_id: string;           // stable ID for MemorySaver session lookup

  // UI output
  next_card: ClinicalCard | null;
  ready_for_analysis: boolean;

  // Analysis outputs
  clinical_abstraction: string | null;   // structured summary from abstraction node
  search_results: string | null;         // knowledge node output
  final_diagnosis: string | null;        // formulated differential
}
```

### Helper: Empty State Factory

```typescript
// src/agents/clinicalGraph.ts
export function createInitialPatientState(threadId: string): PatientState {
  return {
    messages: [],
    chief_complaint: "",
    socrates: {
      site: null, onset: null, character: null, radiation: null,
      associations: null, timing: null, exacerbating: null,
      relieving: null, severity: null, medications: null,
      allergies: null, medical_history: null, age_sex: null
    },
    questions_asked: [],
    answers_given: {},
    phase: "intake",
    thread_id: threadId,
    next_card: null,
    ready_for_analysis: false,
    clinical_abstraction: null,
    search_results: null,
    final_diagnosis: null
  };
}
```

---

## 6. LangGraph Node & Edge Specification

### Node Map

```
START
  │
  ▼
[intent_classifier]   ← runs once on first message; extracts chief_complaint + initial SOCRATES
  │
  ▼
[information_gathering] ⟵──────────────────────────────────────────┐
  │                                                                   │
  │  interrupt() — suspends here, waits for user reply               │
  │  on resume: updates socrates + answers_given                      │
  ▼                                                                   │
[routing_check] ─── "need_more" ────────────────────────────────────┘
  │
  └─── "ready" ──▶ [clinical_abstraction]
                         │
                         ▼
                   [medical_search]
                         │
                         ▼
                   [diagnosis_formulation]
                         │
                         ▼
                        END
```

### Conditional Edge: `routing_check`

The router evaluates the current SOCRATES object and question count:

```typescript
function routingCheck(state: PatientState): "need_more" | "ready" {
  const REQUIRED_FIELDS: (keyof SocratesObject)[] = [
    "onset", "character", "severity", "timing"
  ];
  const OPTIONAL_FIELDS: (keyof SocratesObject)[] = [
    "radiation", "exacerbating", "relieving", "associations"
  ];

  const missingRequired = REQUIRED_FIELDS.filter(f => state.socrates[f] === null);
  const filledOptional = OPTIONAL_FIELDS.filter(f => state.socrates[f] !== null).length;
  const questionCount = state.questions_asked.length;

  // Always ask at least 3 questions
  if (questionCount < 3) return "need_more";

  // Required fields must all be filled
  if (missingRequired.length > 0) return "need_more";

  // After required fields, ask at least 1 optional or cap at 8 questions
  if (filledOptional === 0 && questionCount < 8) return "need_more";

  // Hard cap — don't over-interrogate
  if (questionCount >= 8) return "ready";

  return "ready";
}
```

### Node Specifications

#### `intent_classifier`
- **Input:** First user message (chief complaint)
- **Action:** Calls Gemini with a structured extraction prompt
- **Output:** Populates `chief_complaint`, initial `socrates.site` and `socrates.age_sex` if inferable
- **Prompt key:** `INTENT_EXTRACTION_PROMPT` in `medicalKnowledgePrompts.ts`
- **Transitions to:** `information_gathering` unconditionally

#### `information_gathering`
- **Input:** Current `PatientState` (knows what's already been answered)
- **Action:** Calls Gemini with the doctor persona prompt + SOCRATES gap analysis
- **Output:** `next_card` (the flashcard to show the user); appends generated question to `questions_asked`
- **Critical behaviour:** Calls `interrupt()` after setting `next_card`, suspending graph execution until the user submits their answer
- **On resume:** Receives user answer, updates `socrates[card.socrates_field]` and `answers_given`
- **Transitions to:** `routing_check` (conditional edge)

#### `clinical_abstraction`
- **Input:** Fully populated `socrates` object + `answers_given`
- **Action:** Calls Gemini to produce a structured clinical summary paragraph
- **Output:** `clinical_abstraction` string (e.g., "43-year-old male presenting with sudden onset, crushing, central chest pain radiating to left jaw, 8/10 severity, onset 2 hours ago, relieved by sitting forward")
- **Transitions to:** `medical_search` unconditionally

#### `medical_search`
- **Input:** `clinical_abstraction` string
- **Action (Phase 1 — simulation):** Calls Gemini with a prompt that instructs it to act as a medical knowledge retrieval system. Returns structured JSON with 3–5 candidate differentials and relevant red flags.
- **Action (Phase 2 — future):** Replace Gemini simulation with a real call to Tavily Search API or MedlinePlus API using the abstraction as the query.
- **Output:** `search_results` JSON string
- **Transitions to:** `diagnosis_formulation` unconditionally

#### `diagnosis_formulation`
- **Input:** `clinical_abstraction` + `search_results` + original `socrates`
- **Action:** Calls Gemini to compile the final differential diagnosis card with red flags and recommended next steps
- **Output:** Sets `final_diagnosis`, `ready_for_analysis: true`, and `next_card` with `inputType: "final_summary"`
- **Transitions to:** END

### Doctor Persona Prompt (for `information_gathering`)

The following prompt structure must be used in `medicalKnowledgePrompts.ts`:

```
You are a warm, experienced general physician conducting a clinical history.
Your ONLY task is to ask the ONE most important next question to understand this patient's problem.

Rules:
- Ask only ONE question per turn — never list multiple questions
- Build on what the patient just told you — reference their exact words
- Use natural, caring phrasing: "I see", "That must be uncomfortable", "Tell me more about..."
- For pain: never just ask for a number — ask them to describe the feeling
- Vary style — open questions first, then narrow to specifics
- Never ask something the patient has already answered

Patient's chief complaint: {{chief_complaint}}
What we know so far: {{known_socrates}}
Fields still needed: {{missing_fields}}
Questions already asked: {{questions_asked}}
Last 4 messages: {{recent_conversation}}

Respond ONLY with valid JSON — no markdown fences, no preamble:
{
  "question_text": "Your natural question in plain English",
  "input_type": "options" | "text",
  "placeholder": "Hint text for open-ended fields",
  "options": ["A", "B", "C"],
  "socrates_field": "onset" | "character" | "severity" | ...,
  "reasoning": "Why this is the most important next question"
}

Use input_type "text" for: describing character, timeline, food history, medication names, personal history.
Use input_type "options" for: yes/no, left/right/both, better/worse/unchanged, frequency choices.
```

---

## 7. Human-in-the-Loop: Interrupt Strategy

This is the most critical architectural requirement not in the original plan. Without this,
the graph runs all nodes in sequence without waiting for user input.

### LangGraph.js Interrupt Mechanism

```typescript
import { interrupt, MemorySaver } from "@langchain/langgraph";

// In information_gathering_node:
async function informationGatheringNode(state: PatientState) {
  // 1. Generate the next question card
  const card = await generateNextCard(state);

  // 2. interrupt() suspends graph execution HERE
  //    The value passed to interrupt() is returned to the caller
  //    Graph resumes when .invoke() is called again with the user's answer
  const userAnswer = interrupt({
    type: "awaiting_user_input",
    card                         // UI reads this to render the flashcard
  });

  // 3. Code below runs only AFTER user submits their answer
  const updatedSocrates = { ...state.socrates };
  if (card.socrates_field) {
    updatedSocrates[card.socrates_field] = userAnswer as string;
  }

  return {
    socrates: updatedSocrates,
    questions_asked: [...state.questions_asked, card.question_text],
    answers_given: { ...state.answers_given, [card.question_text]: userAnswer as string },
    next_card: card
  };
}
```

### Session Store with MemorySaver

```typescript
// src/agents/patientSession.ts
import { MemorySaver } from "@langchain/langgraph";

// One checkpointer per conversation session
const sessionStore = new Map<string, MemorySaver>();

export function getOrCreateCheckpointer(threadId: string): MemorySaver {
  if (!sessionStore.has(threadId)) {
    sessionStore.set(threadId, new MemorySaver());
  }
  return sessionStore.get(threadId)!;
}

export function clearSession(threadId: string): void {
  sessionStore.delete(threadId);
}
```

### Graph Invocation Pattern in the UI

```typescript
// src/components/TextChatInterface.tsx

// First message (new complaint):
const threadId = crypto.randomUUID();
const checkpointer = getOrCreateCheckpointer(threadId);
const graph = compiledClinicalGraph.withConfig({ checkpointer });

const config = { configurable: { thread_id: threadId } };

// Stream until first interrupt (graph pauses at information_gathering)
for await (const chunk of graph.stream(
  { messages: [new HumanMessage(userInput)] },
  { ...config, streamMode: "values" }
)) {
  if (chunk.__interrupt__) {
    // Render chunk.__interrupt__[0].value.card as a flashcard
    setCurrentCard(chunk.__interrupt__[0].value.card);
    break;
  }
}

// Subsequent messages (user answered a flashcard):
for await (const chunk of graph.stream(
  new Command({ resume: userAnswer }),  // resume with the answer
  { ...config, streamMode: "values" }
)) {
  if (chunk.__interrupt__) {
    setCurrentCard(chunk.__interrupt__[0].value.card);
    break;
  }
  if (chunk.ready_for_analysis) {
    setFinalDiagnosis(chunk.final_diagnosis);
  }
}
```

---

## 8. Security: API Key Handling

### Development (Local Only)

```env
# .env.local — only for local development
VITE_GEMINI_API_KEY=your-key-here
```

The `VITE_` prefix inlines the key into the browser bundle. This is acceptable for local
development only and must **never** be used in staging or production builds.

### Production: Next.js API Route Proxy

Create a server-side proxy that holds the key securely:

```typescript
// src/app/api/clinical/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,  // server-side only, no VITE_ prefix
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();
  return NextResponse.json(data);
}
```

```env
# .env.local — production key (server-side, never exposed to browser)
GEMINI_API_KEY=your-key-here
```

Then update `clinicalGraph.ts` to point the LangChain model at the proxy endpoint when
`process.env.NODE_ENV === "production"`:

```typescript
const model = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-pro",
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,   // dev
  // For production: override base URL to point at /api/clinical
});
```

> **Note:** The full proxy integration is a Phase 2 task. For the initial implementation,
> document the dev-only `VITE_` approach with a clear comment in code:
> `// TODO: Replace with server-side proxy before any public deployment`

---

## 9. Streaming Strategy

Use `graph.stream()` with `streamMode: "values"` for this implementation. This emits the
full state object after each node completes, which is the right choice because the UI
needs the complete `next_card` object, not partial token streams.

Do not use `streamMode: "messages"` (streams individual tokens) for this workflow — the
flashcard cards need to be received as complete JSON objects, not streamed tokens.

```typescript
// Correct streaming approach
for await (const state of graph.stream(input, {
  configurable: { thread_id },
  streamMode: "values"           // full state after each node
})) {
  // state is a complete PatientState snapshot
  if (state.__interrupt__) { /* handle interrupt */ }
  if (state.next_card) { /* update UI card */ }
  if (state.ready_for_analysis) { /* show final diagnosis */ }
}
```

Add a loading/progress indicator in `TextChatInterface.tsx` that shows which graph node
is currently executing. Use the `phase` field in state for this:

```typescript
const phaseLabels: Record<GraphPhase, string> = {
  intake:       "Understanding your concern...",
  gathering:    "Dr. AI is reviewing your answers...",
  abstraction:  "Building your clinical picture...",
  searching:    "Checking medical knowledge...",
  diagnosis:    "Formulating assessment...",
  complete:     ""
};
```

---

## 10. Updated Dependencies

Add to `package.json` with **pinned versions** to prevent breaking changes:

```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.2.36",
    "@langchain/core": "^0.3.26",
    "@langchain/google-genai": "^0.1.8"
  }
}
```

> **Why pin minor versions?** LangGraph.js is actively developed. The `interrupt()` API
> changed between `0.2.x` versions. Pinning to `^0.2.36` (patch-level updates only)
> prevents silent breakage from minor-version API shifts.

Install command:

```bash
npm install @langchain/langgraph@^0.2.36 @langchain/core@^0.3.26 @langchain/google-genai@^0.1.8
```

---

## 11. Environment Setup

### Local Development Checklist

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
cp .env.example .env.local
# Add VITE_GEMINI_API_KEY=your-key to .env.local

# 3. Verify LangGraph.js resolves correctly
npx tsc --noEmit

# 4. Start dev server
npm run dev
```

### `.env.example` (commit this file, not `.env.local`)

```env
# Development only — DO NOT use in production
VITE_GEMINI_API_KEY=

# Production (server-side proxy) — see src/app/api/clinical/route.ts
GEMINI_API_KEY=
```

---

## 12. Migration Strategy for Existing Code

Existing calls to `getGeminiChatResponse` in `TextChatInterface.tsx` and
`FitnessPanel.tsx` must not be broken during migration.

### Approach: Feature Flag + Parallel Paths

Add a feature flag during the transition period:

```typescript
// src/config/features.ts
export const FEATURES = {
  USE_CLINICAL_GRAPH: import.meta.env.VITE_USE_CLINICAL_GRAPH === "true"
};
```

In `TextChatInterface.tsx`, branch on the flag:

```typescript
if (FEATURES.USE_CLINICAL_GRAPH) {
  // New LangGraph path
  await runClinicalGraphTurn(userInput, threadId);
} else {
  // Old direct Gemini path — untouched
  const response = await getGeminiChatResponse(userInput, history);
  appendMessage(response);
}
```

This allows testing the new graph path with `VITE_USE_CLINICAL_GRAPH=true` without
affecting users on the existing path. Remove the flag and old path once the graph is
validated.

### `followUpGenerator.ts` Migration

The old file used regex-based heuristics to decide when to generate text vs option cards.
The new version replaces this with graph signal reading:

```typescript
// OLD (remove):
export function generateClarificationCards(complaint: string): ClinicalCard[] {
  // regex heuristics...
}

// NEW (add):
export function generateCardFromGraphSignal(
  graphOutput: Pick<PatientState, "next_card" | "phase">
): ClinicalCard | null {
  if (!graphOutput.next_card) return null;
  if (graphOutput.phase === "complete") return null;
  return graphOutput.next_card;
}
```

The `TextInputFlashcard` component export from `TextChatInterface.tsx` and the
option-card renderer in `FitnessPanel.tsx` do not need to change — only their data
source changes from the generator to the graph output.

---

## 13. Error Handling & Retry Strategy

### Node-Level Error Handling

Each node should catch errors and degrade gracefully rather than crashing the graph:

```typescript
async function informationGatheringNode(state: PatientState) {
  try {
    const card = await generateNextCard(state);
    return { next_card: card };
  } catch (error) {
    console.error("[clinical_graph] information_gathering failed:", error);
    // Fallback: return a generic open-ended card so the UI doesn't hang
    return {
      next_card: {
        question: "Can you tell me more about what you're experiencing?",
        inputType: "text" as CardInputType,
        placeholder: "Any detail helps, take your time..."
      }
    };
  }
}
```

### API Failure Recovery

Configure `@langchain/google-genai` with retry logic:

```typescript
const model = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-pro",
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  maxRetries: 3,           // retry on transient failures
  timeout: 30_000          // 30 second timeout per call
});
```

### Graph Crash Recovery in UI

If `graph.stream()` throws, the UI should:
1. Set `phase` back to `"gathering"` locally
2. Show a user-facing error card: "Something went wrong. Your information has been saved — please try again."
3. Preserve the existing `PatientState` so the graph can resume from the last checkpointed state rather than restarting

```typescript
try {
  for await (const chunk of graph.stream(input, config)) { /* ... */ }
} catch (err) {
  setError("I had trouble processing that. Please try sending your message again.");
  // Do NOT clear threadId — the MemorySaver checkpointer still has the state
}
```

---

## 14. Verification Plan (Expanded)

### Automated Checks

```bash
# Type-check the entire codebase including new graph types
npx tsc --noEmit

# Build for production (catches tree-shaking and bundler issues)
npm run build

# Run existing unit tests to confirm nothing regressed
npm test
```

### Manual Verification — Happy Path

1. Set `VITE_USE_CLINICAL_GRAPH=true` in `.env.local`
2. Start the app with `npm run dev`
3. Open the chat interface and type: **"I have a headache"**
4. Verify the first response is a natural follow-up question (not a diagnosis), rendered as a flashcard
5. Click or type an answer to the flashcard
6. Verify the second question references your first answer (e.g., "You mentioned it started this morning...")
7. Answer 3–5 more questions
8. Verify the final response contains a structured differential diagnosis with red flags and recommended next steps
9. Confirm that the `phase` progress label updates correctly on each turn

### Manual Verification — Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| User types a vague first message ("I feel bad") | Graph asks a clarifying open-text question, not a list of options |
| User submits an empty text card | UI should prevent submission; graph should not advance |
| User mentions a red flag symptom (e.g., "chest pain with arm pain") | `diagnosis_formulation` node should include a prominent red flag warning |
| Gemini API key is invalid | Error card appears; graph state is preserved; user can retry |
| User refreshes the page mid-conversation | Session is lost (acceptable for MVP); document this as a known limitation |
| User starts a second complaint after completing one | `clearSession(threadId)` is called; a new `thread_id` is generated |

### Regression Checks

- Confirm `VITE_USE_CLINICAL_GRAPH=false` (or unset) still routes through the old `getGeminiChatResponse` path without errors
- Confirm `FitnessPanel.tsx` coach chat is not broken by the migration
- Confirm existing flashcard option-click handling still works for non-clinical cards

---

## Future Enhancements (Out of Scope for This Migration)

These are explicitly out of scope but should be tracked as follow-up issues:

- **Real medical search:** Replace the `medical_search` Gemini simulation with a Tavily or
  MedlinePlus API call using the `clinical_abstraction` string as the query
- **Server-side graph execution:** Move the LangGraph runtime from client to a Next.js API
  Route or a standalone Node.js service to enable server-side checkpointing and eliminate
  the API key exposure issue entirely
- **Persistent sessions:** Replace in-memory `MemorySaver` with a Redis or Supabase
  checkpointer so sessions survive page refreshes
- **SOCRATES progress indicator:** Show the patient a visual progress bar of how complete
  their clinical history is (percentage of SOCRATES fields filled)
- **FitnessPanel deep integration:** Extend the clinical graph to handle fitness-specific
  queries with a parallel `FitnessState` graph separate from the medical graph

---

*Last updated: Implementation Plan v2.0 — revised from original single-prompt plan.*
*Author: Engineering + AI Architecture Review*
