
import requests
import json

url = "http://127.0.0.1:5001/search-medicine"
payload = {"query": "paracetamol"}
headers = {"Content-Type": "application/json"}

try:
    print(f"Testing endpoint: {url}")
    print(f"Payload: {payload}")
    response = requests.post(url, json=payload, headers=headers, timeout=30)
    
    print(f"Status Code: {response.status_code}")
    print("Response JSON:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print(f"Request Failed: {e}")
