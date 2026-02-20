import requests
import json

KEY = "865a20200amshcc026b276b939a5p1f7177jsn597e7a6962bb"
HOST = "musclewiki-api.p.rapidapi.com"

headers = {
    "x-rapidapi-key": KEY,
    "x-rapidapi-host": HOST
}

endpoints = [
    ("/exercises", {}),
    ("/muscles", {}),
    ("/categories", {}),
    ("/exercises", {"name": "Bench Press"}),
]

print(f"Testing key: {KEY[:5]}...")

for path, params in endpoints:
    url = f"https://{HOST}{path}"
    print(f"\n--- Testing {path} ---")
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print(f"Count: {len(data)}")
                if len(data) > 0:
                    print(f"First item keys: {list(data[0].keys())}")
            else:
                print(f"Response (first 200 chars): {str(data)[:200]}")
        else:
            print(f"Error: {response.text[:200]}")
    except Exception as e:
        print(f"Exception: {e}")
