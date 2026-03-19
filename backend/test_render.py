import requests
try:
    resp = requests.get('https://healthguard-backend-yo9a.onrender.com/muscles', timeout=10)
    print(f"Status Code: {resp.status_code}")
except Exception as e:
    print(f"Error: {e}")
