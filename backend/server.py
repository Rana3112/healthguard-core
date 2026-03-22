import os
import json
import time
import threading
from flask import Flask, request, jsonify, send_file, redirect
from flask_cors import CORS
from dotenv import load_dotenv
import stripe
import hmac
import hashlib
import requests as req

# Load environment variables
basedir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(basedir)
load_dotenv(os.path.join(parent_dir, ".env"))
load_dotenv(os.path.join(parent_dir, ".env.local"), override=True)

api_key = os.getenv("OPENROUTER_API_KEY")
groq_api_key = os.getenv("GROQ_API_KEY")

app = Flask(__name__)
CORS(app)


class TTLCache:
    def __init__(self, max_entries=256):
        self.max_entries = max_entries
        self._data = {}
        self._lock = threading.Lock()

    def get(self, key):
        now = time.time()
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key, value, ttl_seconds):
        with self._lock:
            self._data[key] = (time.time() + ttl_seconds, value)
            if len(self._data) > self.max_entries:
                oldest_key = min(self._data.items(), key=lambda item: item[1][0])[0]
                self._data.pop(oldest_key, None)


def _normalize_text(value):
    return " ".join(str(value or "").strip().lower().split())


def _cache_key(prefix, payload):
    return f"{prefix}:{json.dumps(payload, sort_keys=True, separators=(',', ':'))}"


search_cache = TTLCache(max_entries=128)
workout_cache = TTLCache(max_entries=128)
interaction_cache = TTLCache(max_entries=128)


def _response_json_and_status(response):
    """Normalize Flask view return values into (json_data, status_code)."""
    status_code = 200
    if isinstance(response, tuple):
        response, status_code = response[0], response[1]

    if hasattr(response, "get_json"):
        data = response.get_json(silent=True)
        if data is not None:
            return data, status_code

    if hasattr(response, "get_data"):
        raw = response.get_data(as_text=True)
        return json.loads(raw), status_code

    if isinstance(response, dict):
        return response, status_code

    raise ValueError("Unsupported Flask response type")


def _run_view_in_test_context(view_func, path, payload):
    with app.test_request_context(path, method="POST", json=payload):
        return _response_json_and_status(view_func())


# --- MongoDB Setup ---
from pymongo import MongoClient
import certifi

MONGODB_URI = os.getenv("MONGODB_URI")
mongo_client = None
db = None
chat_collection = None

if MONGODB_URI:
    try:
        mongo_client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
        db = mongo_client.get_default_database()
        chat_collection = db["chats"]
        users_collection = db["users"]  # New collection for subscription status
        print("[System] Successfully connected to MongoDB Atlas.")
    except Exception as e:
        print(f"[System] Failed to connect to MongoDB: {e}")

# --- Stripe Setup ---
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID")
STRIPE_SUCCESS_URL = "http://localhost:5173/app?payment=success"
STRIPE_CANCEL_URL = "http://localhost:5173/app?payment=cancel"

# --- Local Exercise Database ---
LOCAL_EXERCISES = []
IMAGE_BASE_URL = (
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
)


def load_local_exercises():
    """Load exercises from local JSON file."""
    global LOCAL_EXERCISES
    try:
        json_path = os.path.join(basedir, "data", "exercises.json")
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                LOCAL_EXERCISES = json.load(f)
            print(
                f"[System] Loaded {len(LOCAL_EXERCISES)} exercises from local database."
            )
        else:
            print(f"[System] Warning: Local exercise DB not found at {json_path}")
            LOCAL_EXERCISES = []
    except Exception as e:
        print(f"[System] Failed to load local exercises: {e}")
        LOCAL_EXERCISES = []


# --- Removed Local TTS and OCR Setup for Cloud Optimization ---

# Load exercise data on startup
load_local_exercises()


# --- Health Check Endpoint ---
@app.route("/", methods=["GET"])
def health_check():
    """Health check endpoint for OpenShift/container platforms."""
    return jsonify(
        {"status": "healthy", "service": "HealthGuard AI Backend", "version": "1.0.0"}
    )


@app.route("/health", methods=["GET"])
def health():
    """Alternative health check endpoint."""
    return jsonify({"status": "ok"})


# --- Removed /tts and /ocr Endpoints (Now using Gemini Cloud Voice) ---


# --- Medicine Price Search (SerpAPI) ---
from dotenv import load_dotenv

load_dotenv()  # Load .env file in backend/ directory


@app.route("/search-medicine", methods=["POST"])
def search_medicine_endpoint():
    """Search for medicine prices across e-commerce platforms via SerpAPI."""
    from agent_browser import search_medicine

    data = request.json
    query = data.get("query", "")

    if not query:
        return jsonify({"error": "Missing query parameter."}), 400

    cache_key = _cache_key("search-medicine", {"query": _normalize_text(query)})
    cached = search_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    print(f"[Agent] Searching for medicine: '{query}'...")

    try:
        results = search_medicine(query)
        search_cache.set(cache_key, results, ttl_seconds=1800)

        if results.get("success"):
            print(
                f"  Found {results.get('total_results', 0)} results. Cheapest: {results.get('cheapest', {}).get('price_display', 'N/A')}"
            )
        else:
            print(f"  Search failed: {results.get('error', 'Unknown')}")

        return jsonify(results)
    except Exception as e:
        print(f"[Agent] Search error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/android/search-medicine", methods=["POST"])
def android_search_medicine_endpoint():
    """Android-friendly proxy for cached medicine search."""
    data = request.json or {}
    query = data.get("query", "")
    if not query:
        return jsonify({"error": "Missing query parameter."}), 400
    return search_medicine_endpoint()


# --- Auto-Order: Browser-Use Agent ---
import threading
import queue as queue_module

# Store active order sessions
active_orders = {}


@app.route("/auto-order", methods=["POST"])
def auto_order_endpoint():
    """Launch browser-use agent to auto-order a medicine. Returns SSE stream."""
    from flask import Response, stream_with_context

    data = request.json
    url = data.get("url", "")
    product_title = data.get("product_title", "")
    platform = data.get("platform", "Other")

    if not url or not product_title:
        return jsonify({"error": "Missing url or product_title"}), 400

    print(f"[Auto-Order] Starting order for: {product_title}")
    print(f"[Auto-Order] Platform: {platform}")
    print(f"[Auto-Order] URL: {url}")

    order_id = str(int(time.time() * 1000))
    progress_list = []
    result_holder = [None]

    def run_agent():
        from playwright_order_agent import start_order_sync

        result = start_order_sync(url, product_title, platform, progress_list)
        result_holder[0] = result

    thread = threading.Thread(target=run_agent, daemon=True)
    thread.start()

    def generate():
        sent_count = 0
        while thread.is_alive() or sent_count < len(progress_list):
            while sent_count < len(progress_list):
                item = progress_list[sent_count]
                yield f"data: {json.dumps(item)}\n\n"
                sent_count += 1
            time.sleep(0.5)

        # Send remaining items
        while sent_count < len(progress_list):
            item = progress_list[sent_count]
            yield f"data: {json.dumps(item)}\n\n"
            sent_count += 1

        # Send final result
        result = result_holder[0]
        if result:
            yield f"data: {json.dumps({'step': 'final', 'result': result})}\n\n"
        yield 'data: {"step": "done"}\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# --- ExerciseDB Proxy (RapidAPI) ---
# --- Local Exercise Logic ---


def _fetch_exercise_details(target):
    """Fetch exercises from local DB for a specific target muscle."""
    candidates = []
    target_lower = target.lower()

    # Map common AI terms to DB terms
    muscle_map = {
        "chest": "pectorals",
        "back": "middle back",  # or lats, lower back - we will fuzzy search
        "legs": "quadriceps",  # or hamstrings
        "arms": "biceps",
        "shoulders": "shoulders",
        "abs": "abdominals",
        "core": "abdominals",
        "cardio": "cardiovascular system",
    }

    # If target is in map, use the mapped term, otherwise use as is
    # We will also try to match if the target appears in primaryMuscles
    search_terms = [muscle_map.get(target_lower, target_lower), target_lower]

    for ex in LOCAL_EXERCISES:
        p_muscles = [m.lower() for m in (ex.get("primaryMuscles") or [])]

        # Check if any search term matches any primary muscle
        match = False
        for term in search_terms:
            if any(term in pm for pm in p_muscles):
                match = True
                break

        if match:
            # Get GIF URL - handle both formats
            gif_url = None

            # First check if exercise already has gifUrl field (new format)
            if ex.get("gifUrl"):
                gif_url = ex["gifUrl"]
            # Otherwise, try to construct from images array (old format)
            elif ex.get("images"):
                image_path = ex["images"][0]
                gif_url = f"{IMAGE_BASE_URL}{image_path}"

            candidates.append(
                {
                    "id": ex.get("id"),
                    "name": ex.get("name"),
                    "target": (ex.get("primaryMuscles") or ["unknown"])[0],
                    "equipment": ex.get("equipment"),
                    "gifUrl": gif_url or "",
                    "instructions": ex.get("instructions", []),
                }
            )

    return candidates


@app.route("/muscles", methods=["GET"])
def get_muscles():
    """Get list of target muscles from local DB."""
    if not LOCAL_EXERCISES:
        return jsonify([]), 200

    muscles = set()
    for ex in LOCAL_EXERCISES:
        for m in ex.get("primaryMuscles", []):
            muscles.add(m)

    return jsonify(sorted(list(muscles)))


@app.route("/categories", methods=["GET"])
def get_categories():
    """Get list of equipment from local DB."""
    if not LOCAL_EXERCISES:
        return jsonify([]), 200

    equipment = set()
    for ex in LOCAL_EXERCISES:
        if ex.get("equipment"):
            equipment.add(ex["equipment"])

    return jsonify(sorted(list(equipment)))


@app.route("/exercises", methods=["GET"])
def get_exercises_by_target():
    """Get exercises filtered by target muscle and equipment."""
    target = request.args.get("muscle")
    equip = request.args.get("equipment")

    if not target:
        # If no target, return random 50 or empty?
        # FitnessPanel usually asks for target.
        # Let's return a sample
        return jsonify([]), 200

    results = []
    target_lower = target.lower()

    for ex in LOCAL_EXERCISES:
        # Check muscle match (exact or containment)
        p_muscles = [m.lower() for m in ex.get("primaryMuscles", [])]
        if not any(target_lower in pm for pm in p_muscles):
            continue

        # Check equipment match if provided
        if equip and equip.lower() != ex.get("equipment", "").lower():
            continue

        # Construct response object
        # Get GIF URL - handle both formats
        gif_url = None

        # First check if exercise already has gifUrl field (new format)
        if ex.get("gifUrl"):
            gif_url = ex["gifUrl"]
        # Otherwise, try to construct from images array (old format)
        elif ex.get("images"):
            image_path = ex["images"][0]
            gif_url = f"{IMAGE_BASE_URL}{image_path}"

        results.append(
            {
                "id": ex.get("id"),
                "name": ex.get("name"),
                "target": target,  # Use requested target for consistency
                "bodyPart": ex.get("category", "strength"),
                "equipment": ex.get("equipment"),
                "gifUrl": gif_url or "",
                "secondaryMuscles": ex.get("secondaryMuscles", []),
                "instructions": ex.get("instructions", []),
            }
        )

    return jsonify(results)


# --- AI Workout Instructor ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


@app.route("/generate_workout", methods=["POST"])
def generate_workout():
    """Generate a workout plan using OpenRouter LLM and enrich with ExerciseDB data."""
    if not GROQ_API_KEY:
        return jsonify({"error": "GROQ_API_KEY not configured"}), 500
    data = request.json
    age = data.get("age")
    weight = data.get("weight")
    height = data.get("height")
    diet_score = data.get("diet_score")
    workout_intensity = data.get("workout_intensity", "intermediate")
    if not all([age, weight, height, diet_score]):
        return jsonify({"error": "Missing required fields"}), 400

    cache_key = _cache_key(
        "generate_workout",
        {
            "age": str(age).strip(),
            "weight": str(weight).strip(),
            "height": str(height).strip(),
            "diet_score": str(diet_score).strip(),
            "workout_intensity": str(workout_intensity).strip().lower(),
        },
    )
    cached = workout_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    # Ensure key is stripped of whitespace
    api_key_clean = GROQ_API_KEY.strip()

    if not api_key_clean:
        return jsonify({"error": "GROQ_API_KEY is empty"}), 500

    try:
        import requests as req

        print(
            f"[Generate] Request received for Age {age}, {weight}kg, {height}cm, diet {diet_score}, intensity: {workout_intensity}"
        )

        intensity_map = {
            "naive": "Beginner / Light",
            "intermediate": "Intermediate / Moderate",
            "aggressive": "Advanced / Aggressive",
        }
        intensity_label = intensity_map.get(
            str(workout_intensity).lower(), "Intermediate"
        )

        # Intensity-based exercise scaling
        intensity_rules = {
            "naive": "3-4 exercises per day, 2-3 sets each, 60-90 seconds rest between sets. Keep it simple and safe.",
            "intermediate": "5-6 exercises per day, 3-4 sets each, 45-60 seconds rest between sets. Moderate challenge.",
            "aggressive": "7-8 exercises per day, 4-5 sets each, 30-45 seconds rest between sets. Push to the limit with supersets and dropsets.",
        }
        intensity_rule = intensity_rules.get(
            str(workout_intensity).lower(), intensity_rules["intermediate"]
        )

        # 1. Prompt the LLM
        prompt = f"""
        Act as an expert fitness coach and sports nutritionist.
        User Profile:
        - Age: {age} years
        - Weight: {weight}kg
        - Height: {height}cm
        - Diet Quality: {diet_score}/10
        - Desired Workout Intensity: {intensity_label}
        
        INTENSITY RULE: {intensity_rule}
        
        Create a personalized workout plan WITH detailed exercise info AND nutrition advice.
        OUTPUT RULES:
        1. Return ONLY valid JSON. No markdown formatting.
        2. JSON Structure:
        {{
            "analysis": "Brief analysis of physique, BMI, and diet quality...",
            "goal": "Recommended Goal (e.g. Weight Loss, Muscle Gain, Lean Bulk)",
            "nutrition": {{
                "daily_calories": 2200,
                "protein_grams": 120,
                "pre_workout_shake": "1 banana + 1 scoop whey protein + 200ml milk + 1 tbsp peanut butter. Blend and drink 30 min before workout.",
                "post_workout_shake": "1 scoop whey protein + 200ml water + 5g creatine + 1 tbsp honey. Drink within 30 min after workout.",
                "homemade_protein_shake": "2 eggs + 1 banana + 200ml milk + 2 tbsp oats + 1 tbsp peanut butter + 1 tsp cocoa powder. Blend smooth.",
                "diet_tips": ["Eat protein with every meal", "Stay hydrated — 3-4L water daily", "Avoid processed sugar"]
            }},
            "days": [
                {{
                    "day_name": "Day 1: Upper Body",
                    "exercises": [
                        {{ 
                            "name": "Bench Press", 
                            "target": "pectorals", 
                            "equipment": "barbell",
                            "sets": 4,
                            "reps": "8-10",
                            "rest_seconds": 60,
                            "tips": "Keep your shoulder blades pinched. Don't bounce the bar off your chest.",
                            "instructions": ["Lie on a flat bench.", "Grip bar slightly wider than shoulders.", "Lower to chest.", "Press up explosively."]
                        }}
                    ]
                }}
            ]
        }}
        3. Use ExerciseDB compatible targets: pectorals, back, legs, abs, arms, shoulders, lats, biceps, triceps, quads, hamstrings, glutes, calves, delts.
        4. Use ExerciseDB compatible equipment: barbell, dumbbell, cable, body weight, machine, band.
        5. For EACH exercise, you MUST provide: sets (number), reps (string like "8-10" or "12"), rest_seconds (number), tips (string with form advice), and instructions (array of 2-4 steps).
        6. The "nutrition" object with shakes and tips is REQUIRED.
        7. Follow the INTENSITY RULE strictly for exercise count and sets.
        """

        headers = {
            "Authorization": f"Bearer {api_key_clean}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5001",
        }

        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a JSON-only fitness API. Always format your output as valid JSON matching the exact requested structure.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "response_format": {"type": "json_object"},
        }

        print("[Generate] Sending request to Groq...")
        try:
            resp = req.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=20,
            )
            print(f"[Generate] Groq status: {resp.status_code}")
        except Exception as e:
            print(f"[Generate] Groq Request Failed: {e}")
            return jsonify({"error": f"LLM Request Failed: {str(e)}"}), 500

        if resp.status_code != 200:
            print(f"[Generate] LLM Error: {resp.text}")
            return jsonify({"error": f"LLM Error: {resp.text}"}), 500

        llm_data = resp.json()
        content = llm_data["choices"][0]["message"]["content"]
        print("[Generate] LLM Response received. Parsing JSON...")

        # Parse JSON from LLM
        import json

        try:
            plan = json.loads(content)
        except:
            print("[Generate] JSON Parse Failed. Cleaning content...")
            cleaned = content.replace("```json", "").replace("```", "").strip()
            try:
                plan = json.loads(cleaned)
            except Exception as e:
                print(f"[Generate] JSON Parse Error: {e}\nContent: {content[:100]}...")
                return jsonify({"error": "Failed to parse generated plan"}), 500

        # 2. Enrich with Local Exercise Data
        print("[Generate] Enriching with Local Exercise DB...")
        for day in plan.get("days", []):
            for ex in day.get("exercises", []):
                # Map common names to DB targets if needed, but _fetch_exercise_details handles most
                raw_target = ex.get("target", "").lower()

                # Fetch candidates from local DB
                candidates = _fetch_exercise_details(raw_target)

                match_found = False
                if candidates:
                    # 1. Try to find equipment match
                    equip = (ex.get("equipment") or "").lower()
                    matches = [
                        c
                        for c in candidates
                        if equip in (c.get("equipment") or "").lower()
                    ]

                    if matches:
                        import random

                        best = random.choice(matches)
                        match_found = True
                    else:
                        # 2. Fallback to random candidate
                        import random

                        best = random.choice(candidates)
                        match_found = True
                        ex["note"] = "Equipment variation"

                    if match_found:
                        ex["gifUrl"] = best.get("gifUrl")
                        ex["db_id"] = best.get("id")
                        ex["name"] = (
                            f"{best.get('name')} ({ex.get('name')})"  # Combine names
                        )
                        if not ex.get("instructions"):
                            ex["instructions"] = best.get("instructions")

                if not match_found:
                    print(f"[Generate] No local DB match for {raw_target}")
                    # No fallback images - let the UI handle missing images cleanly

        print("[Generate] Plan generation complete.")
        workout_cache.set(cache_key, plan, ttl_seconds=3600)
        return jsonify(plan)

    except Exception as e:
        print(f"[Generate] Critical Error: {e}")
        return jsonify({"error": str(e)}), 500


def search_exercises_from_db(query, limit=10):
    """Search exercises from local database based on query."""
    query_lower = query.lower()
    results = []

    # Keywords to muscle mapping
    muscle_keywords = {
        "abs": ["abdominals", "abs", "core", "obliques", "waist"],
        "abdominal": ["abdominals", "abs", "core", "obliques", "waist"],
        "core": ["abdominals", "abs", "core", "obliques", "waist"],
        "chest": ["pectorals", "chest", "pectoralis"],
        "pecs": ["pectorals", "chest", "pectoralis"],
        "back": [
            "latissimus dorsi",
            "lats",
            "middle back",
            "lower back",
            "upper back",
            "traps",
        ],
        "lats": ["latissimus dorsi", "lats"],
        "biceps": ["biceps", "bicep"],
        "triceps": ["triceps", "tricep"],
        "shoulders": ["shoulders", "deltoids", "delts"],
        "legs": [
            "quadriceps",
            "hamstrings",
            "glutes",
            "calves",
            "adductors",
            "abductors",
        ],
        "quads": ["quadriceps", "quad"],
        "hamstrings": ["hamstrings", "hamstring"],
        "glutes": ["glutes", "gluteus", "butt"],
        "calves": ["calves", "calf"],
        "arms": ["biceps", "triceps", "forearms"],
        "forearms": ["forearms", "forearm"],
        "neck": ["neck"],
        "traps": ["trapezius", "traps"],
    }

    # Check for muscle group keywords
    target_muscles = []
    for keyword, muscles in muscle_keywords.items():
        if keyword in query_lower:
            target_muscles.extend(muscles)

    # If no specific muscle found, try to match exercise names
    if not target_muscles:
        for ex in LOCAL_EXERCISES:
            if query_lower in ex.get("name", "").lower():
                results.append(ex)
                if len(results) >= limit:
                    break
        return results[:limit]

    # Search by muscle groups
    for ex in LOCAL_EXERCISES:
        ex_muscles = [m.lower() for m in (ex.get("primaryMuscles") or [])]
        ex_secondary = [m.lower() for m in (ex.get("secondaryMuscles") or [])]
        all_muscles = ex_muscles + ex_secondary

        # Check if any target muscle matches
        for target in target_muscles:
            if any(target in muscle for muscle in all_muscles):
                if ex not in results:
                    results.append(ex)
                break

        if len(results) >= limit:
            break

    return results[:limit]


@app.route("/api/search-exercises", methods=["POST"])
def search_exercises():
    """Search exercises from local database."""
    data = request.json
    query = data.get("query", "")
    limit = data.get("limit", 10)

    if not query:
        return jsonify({"error": "Query required"}), 400

    try:
        exercises = search_exercises_from_db(query, limit)

        # Format exercises for frontend
        formatted_exercises = []
        for ex in exercises:
            # Get GIF URL
            gif_url = None
            if ex.get("gifUrl"):
                gif_url = ex["gifUrl"]
            elif ex.get("images"):
                image_path = ex["images"][0]
                gif_url = f"{IMAGE_BASE_URL}{image_path}"

            formatted_exercises.append(
                {
                    "id": ex.get("id"),
                    "name": ex.get("name"),
                    "target": (ex.get("primaryMuscles") or ["unknown"])[0],
                    "equipment": ex.get("equipment"),
                    "gifUrl": gif_url or "",
                    "instructions": ex.get("instructions", []),
                    "secondaryMuscles": ex.get("secondaryMuscles", []),
                }
            )

        return jsonify(
            {
                "success": True,
                "exercises": formatted_exercises,
                "query": query,
                "count": len(formatted_exercises),
            }
        )

    except Exception as e:
        print(f"[Search] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/coach/chat", methods=["POST"])
def coach_chat():
    """Chat with the AI Coach about the workout plan."""
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY not configured"}), 500

    data = request.json
    message = data.get("message")
    plan = data.get("plan")
    stats = data.get("stats")
    history = data.get("history", [])

    if not message:
        return jsonify({"error": "Message required"}), 400

    # Check if user is asking for exercise suggestions
    exercise_keywords = [
        "exercise",
        "exercises",
        "suggest",
        "recommend",
        "give me",
        "show me",
        "what exercises",
        "abs exercise",
        "leg exercise",
        "chest exercise",
        "back exercise",
        "shoulder exercise",
        "bicep exercise",
        "tricep exercise",
        "abdominal exercise",
        "core exercise",
        "workout",
        "routine",
        "movement",
    ]

    message_lower = message.lower()
    is_exercise_query = any(keyword in message_lower for keyword in exercise_keywords)

    # If asking for exercises, search the database
    if is_exercise_query:
        try:
            # Search for exercises
            exercises = search_exercises_from_db(message, limit=8)

            if exercises:
                # Format exercises for frontend
                formatted_exercises = []
                for ex in exercises:
                    # Get GIF URL
                    gif_url = None
                    if ex.get("gifUrl"):
                        gif_url = ex["gifUrl"]
                    elif ex.get("images"):
                        image_path = ex["images"][0]
                        gif_url = f"{IMAGE_BASE_URL}{image_path}"

                    formatted_exercises.append(
                        {
                            "id": ex.get("id"),
                            "name": ex.get("name"),
                            "target": (ex.get("primaryMuscles") or ["unknown"])[0],
                            "equipment": ex.get("equipment"),
                            "gifUrl": gif_url or "",
                            "instructions": ex.get("instructions", []),
                            "secondaryMuscles": ex.get("secondaryMuscles", []),
                            "sets": 3,
                            "reps": "10-12",
                            "rest_seconds": 60,
                        }
                    )

                # Create a response with exercise suggestions
                reply = f"Here are some exercises I found for you based on your query. These are from our exercise database with over 2,000 exercises. I've selected the most relevant ones:"

                return jsonify(
                    {
                        "reply": reply,
                        "exercises": formatted_exercises,
                        "is_exercise_response": True,
                    }
                )
            else:
                # No exercises found, use LLM response
                pass

        except Exception as e:
            print(f"[Coach Chat] Exercise search error: {e}")
            # Fall through to LLM response

    try:
        import requests as req

        # Context Construction
        context = f"""
        Role: Expert Fitness Coach.
        User Stats: {stats}
        Current Plan Goal: {plan.get("goal", "General Fitness")}
        Plan Overview: {plan.get("analysis", "Standard Plan")}
        
        You are discussing their plan. Be encouraging, scientific, and clear.
        If they ask about an exercise in the plan, explain form or benefits.
        If they ask about diet, give general advice based on their goal.
        Keep answers concise (max 3-4 sentences unless detailed explanation needed).
        
        If they ask for exercise suggestions, you can mention that I have a database of over 2,000 exercises that I can search for them. Just say "I can search our exercise database for that. What specific muscle group or type of exercise are you looking for?"
        """

        messages = [{"role": "system", "content": context}]

        # Add limited history (last 6 messages) to save tokens but keep context
        for msg in history[-6:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": message})

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5001",
        }

        payload = {
            "model": "meta-llama/llama-3.1-70b-instruct",
            "messages": messages,
            "temperature": 0.7,
        }

        resp = req.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30,
        )

        if resp.status_code != 200:
            return jsonify({"error": f"LLM Error: {resp.text}"}), 500

        llm_data = resp.json()
        reply = llm_data["choices"][0]["message"]["content"]

        return jsonify({"reply": reply})

    except Exception as e:
        print(f"Error in coach chat: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    """Transcribe audio using Groq's Whisper API."""
    if not groq_api_key:
        return jsonify({"error": "GROQ_API_KEY not configured"}), 500

    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]

    if audio_file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    try:
        import requests as req

        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {groq_api_key}"}

        # Groq expects a file tuple: (filename, file_object, content_type)
        files = {"file": (audio_file.filename, audio_file.read(), audio_file.mimetype)}
        data = {"model": "whisper-large-v3", "response_format": "json"}

        resp = req.post(url, headers=headers, files=files, data=data, timeout=30)

        if resp.status_code != 200:
            print(f"[Transcribe] Error from Groq: {resp.text}")
            return jsonify({"error": f"Transcription Error: {resp.text}"}), 500

        transcription_data = resp.json()
        text = transcription_data.get("text", "")

        return jsonify({"text": text.strip()})

    except Exception as e:
        print(f"Error in transcribe_audio: {e}")
        return jsonify({"error": str(e)}), 500


# --- MongoDB Chat Storage Endpoints ---
@app.route("/api/chats/<user_id>", methods=["GET"])
def get_user_chats(user_id):
    if chat_collection is None:
        return jsonify({"error": "MongoDB not configured"}), 503
    try:
        # Fetch all chats for a user, sorted by updatedAt descending
        cursor = (
            chat_collection.find({"userId": user_id}, {"_id": 0})
            .sort("updatedAt", -1)
            .limit(50)
        )
        chats = list(cursor)
        return jsonify(chats), 200
    except Exception as e:
        print(f"Error fetching chats: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/chats/<user_id>", methods=["POST"])
def save_user_chat(user_id):
    if chat_collection is None:
        return jsonify({"error": "MongoDB not configured"}), 503
    try:
        chat_data = request.json
        session_id = chat_data.get("id")
        if not session_id:
            return jsonify({"error": "Missing session ID"}), 400

        # Attach the userId to the document
        chat_data["userId"] = user_id

        # Upsert the chat session
        chat_collection.update_one(
            {"id": session_id, "userId": user_id}, {"$set": chat_data}, upsert=True
        )
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error saving chat: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/chats/<user_id>/<session_id>", methods=["DELETE"])
def delete_user_chat(user_id, session_id):
    if chat_collection is None:
        return jsonify({"error": "MongoDB not configured"}), 503
    try:
        chat_collection.delete_one({"id": session_id, "userId": user_id})
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error deleting chat: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# Drug Interaction Checker
# ============================================================
@app.route("/check-interactions", methods=["POST"])
def check_interactions():
    """Check drug interactions between multiple medicines using LLM."""
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY not configured"}), 500

    data = request.json
    medicines = data.get("medicines", [])

    if len(medicines) < 2:
        return jsonify({"error": "At least 2 medicines required"}), 400

    normalized_meds = sorted(_normalize_text(m) for m in medicines if m)
    cache_key = _cache_key("check-interactions", {"medicines": normalized_meds})
    cached = interaction_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    api_key_clean = OPENROUTER_API_KEY.strip()
    med_list = ", ".join(medicines)

    try:
        import requests as req

        prompt = f"""
        You are a Clinical Pharmacist AI. Analyze drug interactions between these medicines: {med_list}
        
        For EACH pair of medicines, check for interactions.
        
        Return ONLY valid JSON with this structure:
        {{
            "summary": "Brief overall safety assessment",
            "interactions": [
                {{
                    "drug_a": "Medicine name 1",
                    "drug_b": "Medicine name 2",
                    "severity": "safe|caution|dangerous",
                    "description": "What happens when these are taken together",
                    "recommendation": "What the patient should do"
                }}
            ],
            "general_advice": "Overall advice for taking these medicines together"
        }}
        
        SEVERITY LEVELS:
        - "safe": No known interactions, can be taken together
        - "caution": Minor interaction, monitor or adjust timing
        - "dangerous": Serious interaction, avoid combination or consult doctor immediately
        
        Be thorough and clinically accurate. If no interaction exists, still include the pair with severity "safe".
        """

        headers = {
            "Authorization": f"Bearer {api_key_clean}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5001",
        }

        payload = {
            "model": "meta-llama/llama-3.1-70b-instruct",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a JSON-only clinical pharmacist API.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }

        resp = req.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30,
        )

        if resp.status_code != 200:
            return jsonify({"error": f"LLM Error: {resp.text}"}), 500

        llm_data = resp.json()
        content = llm_data["choices"][0]["message"]["content"]

        import json

        result = json.loads(content)
        interaction_cache.set(cache_key, result, ttl_seconds=3600)
        return jsonify(result)

    except Exception as e:
        print(f"[Drug Interaction] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# OpenAI DeepThink Proxy
# ============================================================
@app.route("/api/openai-deepthink", methods=["POST"])
def openai_deepthink_proxy():
    try:
        from flask import Response

        data = request.json
        data["stream"] = True
        openai_api_key = os.getenv("OPENAI_API_KEY")

        if not openai_api_key:
            return jsonify(
                {"error": "OPENAI_API_KEY is not configured on the server."}
            ), 500

        headers = {
            "Authorization": f"Bearer {openai_api_key}",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }
        resp = req.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data,
            stream=True,
            timeout=300,
        )

        if resp.status_code != 200:
            return jsonify(
                {"error": f"OpenAI API Error: {resp.text}"}
            ), resp.status_code

        def generate():
            for chunk in resp.iter_lines():
                if chunk:
                    yield chunk + b"\n\n"

        return Response(generate(), mimetype="text/event-stream")
    except Exception as e:
        print(f"[OpenAI Proxy] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# Stripe & Subscription Persistence
# ============================================================


@app.route("/api/user-status/<user_id>", methods=["GET"])
def get_user_status(user_id):
    """Retrieve the Pro subscription status for a user."""
    if users_collection is None:
        return jsonify({"isPro": False, "error": "Database not available"}), 500

    user_record = users_collection.find_one({"uid": user_id})
    if user_record:
        return jsonify({"isPro": user_record.get("isPro", False)})

    # If no record, create one as free user
    users_collection.insert_one(
        {"uid": user_id, "isPro": False, "updatedAt": time.time()}
    )
    return jsonify({"isPro": False})


@app.route("/api/create-checkout-session", methods=["POST"])
def create_checkout_session():
    """Start a Stripe Checkout session for the Pro subscription."""
    data = request.json
    user_id = data.get("userId")
    user_email = data.get("email")

    if not user_id:
        return jsonify({"error": "User ID is required"}), 400

    try:
        checkout_session = stripe.checkout.Session.create(
            customer_email=user_email,
            payment_method_types=["card"],
            line_items=[
                {
                    "price": STRIPE_PRICE_ID,
                    "quantity": 1,
                }
            ],
            mode="subscription",
            success_url=STRIPE_SUCCESS_URL,
            cancel_url=STRIPE_CANCEL_URL,
            client_reference_id=user_id,
            metadata={"user_id": user_id},
        )
        return jsonify({"url": checkout_session.url})
    except Exception as e:
        print(f"[Stripe] Checkout error: {e}")
        return jsonify(error=str(e)), 500


@app.route("/api/stripe-webhook", methods=["POST"])
def stripe_webhook():
    """Listen for Stripe events to update user Pro status."""
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        return jsonify(error=str(e)), 400

    # Handle the checkout.session.completed event
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id")
        if not user_id:
            user_id = session.get("metadata", {}).get("user_id")

        if user_id:
            print(f"[Stripe] Payment success for user: {user_id}")
            users_collection.update_one(
                {"uid": user_id},
                {"$set": {"isPro": True, "updatedAt": time.time()}},
                upsert=True,
            )

    # Handle subscription cancellation
    if event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        # This one is trickier as we need to map customer ID back to user ID
        # Stripe webhooks should ideally send the user_id in metadata of the subscription too
        # For this MVP, we will rely on session completion.
        pass

    return jsonify(success=True)


# --- Nvidia Kimi K2.5 Deep Think Endpoint ---
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")


@app.route("/api/nvidia-deepthink", methods=["POST"])
def nvidia_deepthink():
    """Stream Kimi K2.5 (Nvidia) for Max Deep Think mode."""
    if not NVIDIA_API_KEY:
        return jsonify({"error": "NVIDIA_API_KEY not configured"}), 500

    data = request.get_json()
    messages = data.get("messages", [])

    # Build payload for Nvidia's OpenAI-compatible API
    nvidia_payload = {
        "model": "moonshotai/kimi-k2.5",
        "messages": messages,
        "temperature": 1,
        "top_p": 1,
        "max_tokens": 16384,
        "stream": True,
        "extra_body": {"thinking": True},
    }

    try:
        nvidia_response = req.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            json=nvidia_payload,
            stream=True,
            timeout=120,
        )

        if nvidia_response.status_code != 200:
            error_text = nvidia_response.text
            print(f"[Nvidia API Error] {nvidia_response.status_code}: {error_text}")
            return jsonify(
                {
                    "error": f"Nvidia API returned {nvidia_response.status_code}",
                    "details": error_text,
                }
            ), nvidia_response.status_code

        def generate():
            for line in nvidia_response.iter_lines():
                if line:
                    decoded = line.decode("utf-8")
                    yield decoded + "\n"
            yield "data: [DONE]\n"

        from flask import Response

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
            },
        )

    except Exception as e:
        print(f"[Nvidia DeepThink Error] {e}")
        return jsonify({"error": str(e)}), 500


# ==================== VITALS REMINDER SYSTEM ====================
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta

REMINDERS_FILE = "/tmp/reminders.json"


def _load_reminders():
    if os.path.exists(REMINDERS_FILE):
        with open(REMINDERS_FILE, "r") as f:
            return json.load(f)
    return []


def _save_reminders(reminders):
    with open(REMINDERS_FILE, "w") as f:
        json.dump(reminders, f, indent=2)


def send_email_notification(to_email, subject, body):
    """Send email notification via SMTP."""
    try:
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_pass = os.getenv("SMTP_PASS", "")

        if not smtp_user or not smtp_pass:
            print(
                f"[Reminder] SMTP not configured. Would send to {to_email}: {subject}"
            )
            return False

        msg = MIMEMultipart()
        msg["From"] = smtp_user
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))

        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"[Reminder] Email sent to {to_email}")
        return True
    except Exception as e:
        print(f"[Reminder] Email error: {e}")
        return False


def send_whatsapp_notification(
    phone, message, use_template=False, template_variables=None
):
    """Send WhatsApp notification via Twilio or WhatsApp Business API.

    For business-initiated conversations, we must use approved templates.
    For user-initiated conversations (within 24h of user reply), we can send free-form messages.
    """
    try:
        twilio_sid = os.getenv("TWILIO_SID", "")
        twilio_token = os.getenv("TWILIO_TOKEN", "")
        twilio_whatsapp_from = os.getenv(
            "TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886"
        )

        if not twilio_sid or not twilio_token:
            print(
                f"[Reminder] Twilio not configured. Would send WhatsApp to {phone}: {message}"
            )
            return False

        from twilio.rest import Client

        client = Client(twilio_sid, twilio_token)

        if use_template and template_variables:
            # Use approved template for business-initiated conversations
            # Template: Appointment Reminders (ContentSid: HXb5b62575e6e4ff6129ad7c8efe1f983e)
            # Variables: {{1}} = date, {{2}} = time
            content_sid = template_variables.get(
                "content_sid", "HXb5b62575e6e4ff6129ad7c8efe1f983e"
            )
            variables = template_variables.get("variables", {})

            msg = client.messages.create(
                from_=twilio_whatsapp_from,
                to=f"whatsapp:{phone}",
                content_sid=content_sid,
                content_variables=json.dumps(variables),
            )
            print(f"[Reminder] WhatsApp template sent to {phone}: {msg.sid}")
        else:
            # Send free-form message (only works within 24h of user's last message)
            msg = client.messages.create(
                body=message, from_=twilio_whatsapp_from, to=f"whatsapp:{phone}"
            )
            print(f"[Reminder] WhatsApp free-form message sent to {phone}: {msg.sid}")

        return True
    except Exception as e:
        print(f"[Reminder] WhatsApp error: {e}")
        return False


def check_and_send_reminders():
    """Check all reminders and send notifications for due ones."""
    reminders = _load_reminders()
    now = datetime.now()
    updated = False

    for reminder in reminders:
        if reminder.get("sent"):
            continue

        due_date = datetime.fromisoformat(reminder["due_date"])
        if now >= due_date:
            email = reminder.get("email", "")
            phone = reminder.get("phone", "")
            interval = reminder.get("interval_label", "your scheduled time")

            # Send email
            if email:
                subject = "HealthGuard AI - Vitals Update Reminder"
                body = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #0D9488, #10B981); padding: 30px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0;">HealthGuard AI</h1>
                        <p style="color: rgba(255,255,255,0.8); margin-top: 8px;">Vitals Update Reminder</p>
                    </div>
                    <div style="padding: 24px; background: #f8fafc; border-radius: 0 0 12px 12px;">
                        <p style="font-size: 16px; color: #334155;">Hello!</p>
                        <p style="font-size: 14px; color: #64748b;">
                            It's been {interval} since you last logged your health vitals.
                            Keeping your vitals up to date helps our AI provide better, personalized health advice.
                        </p>
                        <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #0D9488;">
                            <p style="margin: 0; font-weight: bold; color: #0D9488;">Action Required:</p>
                            <p style="margin: 8px 0 0 0; color: #334155;">Open HealthGuard AI and update your vitals in the Health Dashboard.</p>
                        </div>
                        <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
                            This is an automated reminder from HealthGuard AI. You can manage your reminders in Settings.
                        </p>
                    </div>
                </div>
                """
                send_email_notification(email, subject, body)

            # Send WhatsApp
            if phone:
                # Use template for business-initiated conversation
                due_date = datetime.fromisoformat(reminder["due_date"])
                formatted_date = due_date.strftime("%m/%d")
                formatted_time = due_date.strftime("%I%p").lower()  # e.g., "3pm"

                template_variables = {
                    "content_sid": "HXb5b62575e6e4ff6129ad7c8efe1f983e",  # Appointment Reminders template
                    "variables": {"1": formatted_date, "2": formatted_time},
                }
                send_whatsapp_notification(
                    phone,
                    None,
                    use_template=True,
                    template_variables=template_variables,
                )

            reminder["sent"] = True
            reminder["sent_at"] = now.isoformat()
            updated = True

    if updated:
        _save_reminders(reminders)


# Run reminder checker every hour in background
def reminder_scheduler():
    while True:
        try:
            check_and_send_reminders()
        except Exception as e:
            print(f"[Reminder Scheduler] Error: {e}")
        time.sleep(3600)  # Check every hour


reminder_thread = threading.Thread(target=reminder_scheduler, daemon=True)
reminder_thread.start()


@app.route("/api/reminder", methods=["POST"])
def create_reminder():
    """Create a new vitals reminder."""
    data = request.json
    email = data.get("email", "")
    phone = data.get("phone", "")
    interval_days = int(data.get("interval_days", 7))
    interval_label = data.get("interval_label", f"{interval_days} days")

    if not email and not phone:
        return jsonify({"error": "Email or phone is required"}), 400

    due_date = datetime.now() + timedelta(days=interval_days)

    reminder = {
        "id": str(int(time.time() * 1000)),
        "email": email,
        "phone": phone,
        "interval_days": interval_days,
        "interval_label": interval_label,
        "created_at": datetime.now().isoformat(),
        "due_date": due_date.isoformat(),
        "sent": False,
    }

    reminders = _load_reminders()
    reminders.append(reminder)
    _save_reminders(reminders)

    print(
        f"[Reminder] Created: {interval_label} reminder for {email or phone}, due: {due_date.strftime('%Y-%m-%d')}"
    )
    return jsonify({"success": True, "reminder": reminder})


@app.route("/api/reminder/<email>", methods=["GET"])
def get_reminders(email):
    """Get all reminders for a user."""
    reminders = _load_reminders()
    user_reminders = [r for r in reminders if r.get("email") == email]
    return jsonify({"reminders": user_reminders})


@app.route("/api/reminder/<reminder_id>", methods=["DELETE"])
def delete_reminder(reminder_id):
    """Delete a reminder."""
    reminders = _load_reminders()
    reminders = [r for r in reminders if r.get("id") != reminder_id]
    _save_reminders(reminders)
    return jsonify({"success": True})


@app.route("/api/reminder/test", methods=["POST"])
def test_reminder():
    """Test email/WhatsApp notification."""
    data = request.json
    email = data.get("email", "")
    phone = data.get("phone", "")

    results = {}
    if email:
        results["email"] = send_email_notification(
            email,
            "HealthGuard AI - Test Notification",
            "<h2>Test Successful!</h2><p>Your email notifications are configured correctly.</p>",
        )
    if phone:
        results["whatsapp"] = send_whatsapp_notification(
            phone,
            "HealthGuard AI - Test Notification\n\nYour WhatsApp notifications are configured correctly.",
        )

    return jsonify({"success": True, "results": results})


@app.route("/api/general-reminder", methods=["POST"])
def create_general_reminder():
    """Create a general reminder (not just for vitals)."""
    data = request.json
    email = data.get("email", "")
    phone = data.get("phone", "")
    reminder_text = data.get("reminder_text", "")
    due_date_str = data.get("due_date", "")
    reminder_time = data.get("reminder_time", "")

    if not email and not phone:
        return jsonify({"error": "Email or phone is required"}), 400
    if not reminder_text:
        return jsonify({"error": "Reminder text is required"}), 400

    try:
        # Parse due date
        if due_date_str:
            due_date = datetime.fromisoformat(due_date_str.replace("Z", "+00:00"))
        else:
            due_date = datetime.now() + timedelta(days=1)

        # Create reminder object
        reminder = {
            "id": str(int(time.time() * 1000)),
            "email": email,
            "phone": phone,
            "interval_days": 0,
            "interval_label": f"General reminder: {reminder_text[:50]}...",
            "reminder_text": reminder_text,
            "reminder_time": reminder_time,
            "created_at": datetime.now().isoformat(),
            "due_date": due_date.isoformat(),
            "sent": False,
            "type": "general",
        }

        # Save to reminders list
        reminders = _load_reminders()
        reminders.append(reminder)
        _save_reminders(reminders)

        # Send confirmation email immediately if email provided
        if email:
            formatted_date = due_date.strftime("%A, %B %d, %Y")
            subject = "HealthGuard AI - Reminder Confirmation"
            body = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #8B5CF6, #EC4899); padding: 30px; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">HealthGuard AI</h1>
                    <p style="color: rgba(255,255,255,0.8); margin-top: 8px;">Reminder Confirmation</p>
                </div>
                <div style="padding: 24px; background: #f8fafc; border-radius: 0 0 12px 12px;">
                    <p style="font-size: 16px; color: #334155;">Hello!</p>
                    <p style="font-size: 14px; color: #64748b;">
                        Your reminder has been successfully set:
                    </p>
                    <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #8B5CF6;">
                        <p style="margin: 0; font-weight: bold; color: #8B5CF6;">Reminder Details:</p>
                        <p style="margin: 8px 0 0 0; color: #334155; font-size: 14px;">
                            <strong>Text:</strong> {reminder_text}<br>
                            <strong>Scheduled for:</strong> {formatted_date} at {reminder_time if reminder_time else "10:00 AM"}
                        </p>
                    </div>
                    <p style="font-size: 14px; color: #64748b;">
                        You'll receive another notification at the scheduled time.
                    </p>
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
                        This is an automated confirmation from HealthGuard AI. You can manage your reminders in the app settings.
                    </p>
                </div>
            </div>
            """
            send_email_notification(email, subject, body)

        # Send WhatsApp confirmation if phone provided
        if phone:
            # Use template for business-initiated conversation
            formatted_date = due_date.strftime("%m/%d")
            # Parse reminder_time if provided, otherwise use default
            if reminder_time:
                # Try to parse time like "10:00 AM" or "10am"
                import re

                time_match = re.search(
                    r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)", reminder_time
                )
                if time_match:
                    hour = int(time_match.group(1))
                    minute = time_match.group(2) or "00"
                    ampm = time_match.group(3).lower()
                    formatted_time = f"{hour}:{minute}{ampm}"
                else:
                    formatted_time = "10:00am"
            else:
                formatted_time = "10:00am"

            template_variables = {
                "content_sid": "HXb5b62575e6e4ff6129ad7c8efe1f983e",  # Appointment Reminders template
                "variables": {"1": formatted_date, "2": formatted_time},
            }
            send_whatsapp_notification(
                phone, None, use_template=True, template_variables=template_variables
            )

        print(
            f"[General Reminder] Created: {reminder_text[:50]}... for {email or phone}, due: {due_date.strftime('%Y-%m-%d %H:%M')}"
        )
        return jsonify({"success": True, "reminder": reminder})

    except Exception as e:
        print(f"[General Reminder] Error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
