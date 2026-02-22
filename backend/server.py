import os
import json
import time
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
basedir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(basedir)
load_dotenv(os.path.join(parent_dir, '.env'))
load_dotenv(os.path.join(parent_dir, '.env.local'), override=True)

api_key = os.getenv("OPENROUTER_API_KEY")
groq_api_key = os.getenv("GROQ_API_KEY")

app = Flask(__name__)
CORS(app)

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
        chat_collection = db['chats']
        print("[System] Successfully connected to MongoDB Atlas.")
    except Exception as e:
        print(f"[System] Failed to connect to MongoDB: {e}")

# --- Local Exercise Database ---
LOCAL_EXERCISES = []
IMAGE_BASE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"

def load_local_exercises():
    """Load exercises from local JSON file."""
    global LOCAL_EXERCISES
    try:
        json_path = os.path.join(basedir, 'data', 'exercises.json')
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                LOCAL_EXERCISES = json.load(f)
            print(f"[System] Loaded {len(LOCAL_EXERCISES)} exercises from local database.")
        else:
            print(f"[System] Warning: Local exercise DB not found at {json_path}")
            LOCAL_EXERCISES = []
    except Exception as e:
        print(f"[System] Failed to load local exercises: {e}")
        LOCAL_EXERCISES = []

load_local_exercises()

# --- Removed OCR and TTS Setup for Memory Optimization ---



# --- Removed /tts and /ocr Endpoints ---



# --- Medicine Price Search (SerpAPI) ---
from dotenv import load_dotenv
load_dotenv()  # Load .env file in backend/ directory

@app.route('/search-medicine', methods=['POST'])
def search_medicine_endpoint():
    """Search for medicine prices across e-commerce platforms via SerpAPI."""
    from agent_browser import search_medicine
    
    data = request.json
    query = data.get('query', '')
    
    if not query:
        return jsonify({"error": "Missing query parameter."}), 400
    
    print(f"[Agent] Searching for medicine: '{query}'...")
    
    try:
        results = search_medicine(query)
        
        if results.get('success'):
            print(f"  Found {results.get('total_results', 0)} results. Cheapest: {results.get('cheapest', {}).get('price_display', 'N/A')}")
        else:
            print(f"  Search failed: {results.get('error', 'Unknown')}")
        
        return jsonify(results)
    except Exception as e:
        print(f"[Agent] Search error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# --- Auto-Order: Browser-Use Agent ---
import threading
import queue as queue_module

# Store active order sessions
active_orders = {}

@app.route('/auto-order', methods=['POST'])
def auto_order_endpoint():
    """Launch browser-use agent to auto-order a medicine. Returns SSE stream."""
    from flask import Response, stream_with_context
    
    data = request.json
    url = data.get('url', '')
    product_title = data.get('product_title', '')
    platform = data.get('platform', 'Other')
    
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
        yield "data: {\"step\": \"done\"}\n\n"
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
        }
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
        "back": "middle back", # or lats, lower back - we will fuzzy search
        "legs": "quadriceps", # or hamstrings
        "arms": "biceps",
        "shoulders": "shoulders",
        "abs": "abdominals",
        "core": "abdominals",
        "cardio": "cardiovascular system"
    }
    
    # If target is in map, use the mapped term, otherwise use as is
    # We will also try to match if the target appears in primaryMuscles
    search_terms = [muscle_map.get(target_lower, target_lower), target_lower]
    
    for ex in LOCAL_EXERCISES:
        p_muscles = [m.lower() for m in (ex.get('primaryMuscles') or [])]
        
        # Check if any search term matches any primary muscle
        match = False
        for term in search_terms:
            if any(term in pm for pm in p_muscles):
                match = True
                break
        
        if match:
             image_path = ex.get('images', [])[0] if ex.get('images') else None
             gif_url = f"{IMAGE_BASE_URL}{image_path}" if image_path else None
             
             candidates.append({
                "id": ex.get('id'),
                "name": ex.get('name'),
                "target": (ex.get('primaryMuscles') or ['unknown'])[0],
                "equipment": ex.get('equipment'),
                "gifUrl": gif_url,
                "instructions": ex.get('instructions', [])
            })
    
    return candidates

@app.route('/muscles', methods=['GET'])
def get_muscles():
    """Get list of target muscles from local DB."""
    if not LOCAL_EXERCISES:
        return jsonify([]), 200
    
    muscles = set()
    for ex in LOCAL_EXERCISES:
        for m in ex.get('primaryMuscles', []):
            muscles.add(m)
    
    return jsonify(sorted(list(muscles)))

@app.route('/categories', methods=['GET'])
def get_categories():
    """Get list of equipment from local DB."""
    if not LOCAL_EXERCISES:
        return jsonify([]), 200
        
    equipment = set()
    for ex in LOCAL_EXERCISES:
        if ex.get('equipment'):
            equipment.add(ex['equipment'])
            
    return jsonify(sorted(list(equipment)))

@app.route('/exercises', methods=['GET'])
def get_exercises_by_target():
    """Get exercises filtered by target muscle and equipment."""
    target = request.args.get('muscle')
    equip = request.args.get('equipment')
    
    if not target:
        # If no target, return random 50 or empty? 
        # FitnessPanel usually asks for target.
        # Let's return a sample
        return jsonify([]), 200

    results = []
    target_lower = target.lower()
    
    for ex in LOCAL_EXERCISES:
        # Check muscle match (exact or containment)
        p_muscles = [m.lower() for m in ex.get('primaryMuscles', [])]
        if not any(target_lower in pm for pm in p_muscles):
            continue
            
        # Check equipment match if provided
        if equip and equip.lower() != ex.get('equipment', '').lower():
            continue
            
        # Construct response object
        image_path = ex.get('images', [])[0] if ex.get('images') else None
        gif_url = f"{IMAGE_BASE_URL}{image_path}" if image_path else None
        
        results.append({
            "id": ex.get('id'),
            "name": ex.get('name'),
            "target": target, # Use requested target for consistency
            "bodyPart": ex.get('category', 'strength'),
            "equipment": ex.get('equipment'),
            "gifUrl": gif_url,
            "secondaryMuscles": ex.get('secondaryMuscles', []),
            "instructions": ex.get('instructions', [])
        })
        
    return jsonify(results)



# --- AI Workout Instructor ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

@app.route('/generate_workout', methods=['POST'])
def generate_workout():
    """Generate a workout plan using OpenRouter LLM and enrich with ExerciseDB data."""
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY not configured"}), 500
    
    data = request.json
    age = data.get('age')
    weight = data.get('weight')
    height = data.get('height')
    diet_score = data.get('diet_score')
    workout_intensity = data.get('workout_intensity', 'intermediate')
    if not all([age, weight, height, diet_score]):
        return jsonify({"error": "Missing required fields"}), 400

    # Ensure key is stripped of whitespace
    api_key_clean = OPENROUTER_API_KEY.strip()
    
    if not api_key_clean:
        return jsonify({"error": "OPENROUTER_API_KEY is empty"}), 500

    try:
        import requests as req
        print(f"[Generate] Request received for Age {age}, {weight}kg, {height}cm, diet {diet_score}, intensity: {workout_intensity}")
        
        intensity_map = {
            "naive": "Beginner / Light",
            "intermediate": "Intermediate / Moderate",
            "aggressive": "Advanced / Aggressive"
        }
        intensity_label = intensity_map.get(str(workout_intensity).lower(), "Intermediate")
        
        # Intensity-based exercise scaling
        intensity_rules = {
            "naive": "3-4 exercises per day, 2-3 sets each, 60-90 seconds rest between sets. Keep it simple and safe.",
            "intermediate": "5-6 exercises per day, 3-4 sets each, 45-60 seconds rest between sets. Moderate challenge.",
            "aggressive": "7-8 exercises per day, 4-5 sets each, 30-45 seconds rest between sets. Push to the limit with supersets and dropsets."
        }
        intensity_rule = intensity_rules.get(str(workout_intensity).lower(), intensity_rules["intermediate"])

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
            "model": "meta-llama/llama-3.1-70b-instruct",
            "messages": [
                {"role": "system", "content": "You are a JSON-only fitness API."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
        }

        print("[Generate] Sending request to OpenRouter...")
        try:
            resp = req.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=45) # Increased timeout
            print(f"[Generate] OpenRouter status: {resp.status_code}")
        except Exception as e:
            print(f"[Generate] OpenRouter Request Failed: {e}")
            return jsonify({"error": f"LLM Request Failed: {str(e)}"}), 500
        
        if resp.status_code != 200:
            print(f"[Generate] LLM Error: {resp.text}")
            return jsonify({"error": f"LLM Error: {resp.text}"}), 500
            
        llm_data = resp.json()
        content = llm_data['choices'][0]['message']['content']
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
        for day in plan.get('days', []):
            for ex in day.get('exercises', []):
                # Map common names to DB targets if needed, but _fetch_exercise_details handles most
                raw_target = ex.get('target', '').lower()
                
                # Fetch candidates from local DB
                candidates = _fetch_exercise_details(raw_target)
                
                match_found = False
                if candidates:
                    # 1. Try to find equipment match
                    equip = (ex.get('equipment') or '').lower()
                    matches = [c for c in candidates if equip in (c.get('equipment') or '').lower()]
                    
                    if matches:
                        import random
                        best = random.choice(matches)
                        match_found = True
                    else:
                        # 2. Fallback to random candidate
                        import random
                        best = random.choice(candidates)
                        match_found = True
                        ex['note'] = "Equipment variation"

                    if match_found:
                        ex['gifUrl'] = best.get('gifUrl')
                        ex['db_id'] = best.get('id')
                        ex['name'] = f"{best.get('name')} ({ex.get('name')})" # Combine names
                        if not ex.get('instructions'):
                            ex['instructions'] = best.get('instructions')

                if not match_found:
                    print(f"[Generate] No local DB match for {raw_target}")
                    # No fallback images - let the UI handle missing images cleanly
                
        print("[Generate] Plan generation complete.")
        return jsonify(plan)

    except Exception as e:
        print(f"[Generate] Critical Error: {e}")
        return jsonify({"error": str(e)}), 500



@app.route('/coach/chat', methods=['POST'])
def coach_chat():
    """Chat with the AI Coach about the workout plan."""
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY not configured"}), 500
    
    data = request.json
    message = data.get('message')
    plan = data.get('plan')
    stats = data.get('stats')
    history = data.get('history', [])
    
    if not message:
        return jsonify({"error": "Message required"}), 400

    try:
        import requests as req
        
        # Context Construction
        context = f"""
        Role: Expert Fitness Coach.
        User Stats: {stats}
        Current Plan Goal: {plan.get('goal', 'General Fitness')}
        Plan Overview: {plan.get('analysis', 'Standard Plan')}
        
        You are discussing their plan. Be encouraging, scientific, and clear.
        If they ask about an exercise in the plan, explain form or benefits.
        If they ask about diet, give general advice based on their goal.
        Keep answers concise (max 3-4 sentences unless detailed explanation needed).
        """
        
        messages = [{"role": "system", "content": context}]
        
        # Add limited history (last 6 messages) to save tokens but keep context
        for msg in history[-6:]:
            messages.append({"role": msg['role'], "content": msg['content']})
            
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

        resp = req.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=30)
        
        if resp.status_code != 200:
            return jsonify({"error": f"LLM Error: {resp.text}"}), 500
            
        llm_data = resp.json()
        reply = llm_data['choices'][0]['message']['content']
        
        return jsonify({"reply": reply})

    except Exception as e:
        print(f"Error in coach chat: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """Transcribe audio using Groq's Whisper API."""
    if not groq_api_key:
        return jsonify({"error": "GROQ_API_KEY not configured"}), 500
        
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
        
    audio_file = request.files['audio']
    
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    try:
        import requests as req
        
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {
            "Authorization": f"Bearer {groq_api_key}"
        }
        
        # Groq expects a file tuple: (filename, file_object, content_type)
        files = {
            "file": (audio_file.filename, audio_file.read(), audio_file.mimetype)
        }
        data = {
            "model": "whisper-large-v3",
            "response_format": "json"
        }
        
        resp = req.post(url, headers=headers, files=files, data=data, timeout=30)
        
        if resp.status_code != 200:
            print(f"[Transcribe] Error from Groq: {resp.text}")
            return jsonify({"error": f"Transcription Error: {resp.text}"}), 500
            
        transcription_data = resp.json()
        text = transcription_data.get('text', '')
        
        return jsonify({"text": text.strip()})
        
    except Exception as e:
        print(f"Error in transcribe_audio: {e}")
        return jsonify({"error": str(e)}), 500


# --- MongoDB Chat Storage Endpoints ---
@app.route('/api/chats/<user_id>', methods=['GET'])
def get_user_chats(user_id):
    if chat_collection is None:
        return jsonify({"error": "MongoDB not configured"}), 503
    try:
        # Fetch all chats for a user, sorted by updatedAt descending
        cursor = chat_collection.find({"userId": user_id}, {"_id": 0}).sort("updatedAt", -1).limit(50)
        chats = list(cursor)
        return jsonify(chats), 200
    except Exception as e:
        print(f"Error fetching chats: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chats/<user_id>', methods=['POST'])
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
            {"id": session_id, "userId": user_id},
            {"$set": chat_data},
            upsert=True
        )
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error saving chat: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chats/<user_id>/<session_id>', methods=['DELETE'])
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
@app.route('/check-interactions', methods=['POST'])
def check_interactions():
    """Check drug interactions between multiple medicines using LLM."""
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY not configured"}), 500
    
    data = request.json
    medicines = data.get('medicines', [])
    
    if len(medicines) < 2:
        return jsonify({"error": "At least 2 medicines required"}), 400
    
    api_key_clean = OPENROUTER_API_KEY.strip()
    med_list = ', '.join(medicines)
    
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
                {"role": "system", "content": "You are a JSON-only clinical pharmacist API."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        
        resp = req.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=30)
        
        if resp.status_code != 200:
            return jsonify({"error": f"LLM Error: {resp.text}"}), 500
        
        llm_data = resp.json()
        content = llm_data['choices'][0]['message']['content']
        
        import json
        result = json.loads(content)
        return jsonify(result)
        
    except Exception as e:
        print(f"[Drug Interaction] Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    load_ocr_model()
    app.run(host='0.0.0.0', port=5001)
