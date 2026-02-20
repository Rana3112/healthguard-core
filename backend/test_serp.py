import os
from dotenv import load_dotenv
import requests

# Explicitly load .env
load_dotenv('.env')

API_KEY = os.getenv('SERP_API_KEY')
print(f"Loaded API Key: {API_KEY[:5]}...{API_KEY[-5:] if API_KEY else 'None'}")

if not API_KEY:
    print("Error: SERP_API_KEY not found in .env")
    exit(1)

url = "https://serpapi.com/search.json"
params = {
    "engine": "google_shopping",
    "q": "Paracetamol medicine india",
    "location": "India",
    "hl": "en",
    "gl": "in",
    "api_key": API_KEY,
    "num": 5
}

print(f"Testing SERP API connection to {url}...")
try:
    response = requests.get(url, params=params, timeout=10)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if "error" in data:
            print(f"API Returned Error: {data['error']}")
        else:
            results = data.get("shopping_results", [])
            print(f"Success! Found {len(results)} shopping results.")
            if results:
                print(f"First item: {results[0].get('title')} - {results[0].get('price')}")
    else:
        print(f"Request failed: {response.text}")
except Exception as e:
    print(f"Exception Message: {e}")
