import requests
import time
import json

url = "https://healthguard-backend-yo9a.onrender.com/generate_workout"
payload = {
    "age": "25",
    "weight": "72",
    "height": "175",
    "diet_score": 4,
    "workout_intensity": "intermediate"
}

print(f"Sending POST request to {url}...")
start_time = time.time()

try:
    # Set a long timeout to see how long it actually takes
    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=150)
    end_time = time.time()
    
    print(f"\nStatus Code: {response.status_code}")
    print(f"Time Taken: {end_time - start_time:.2f} seconds")
    
    if response.status_code == 200:
        data = response.json()
        print(f"\nSuccess! Received workout plan with goal: {data.get('goal', 'N/A')}")
    else:
        print(f"\nError Response: {response.text}")
        
except requests.exceptions.Timeout:
    print(f"\nRequest timed out after {time.time() - start_time:.2f} seconds.")
except Exception as e:
    print(f"\nException occurred: {e}")
