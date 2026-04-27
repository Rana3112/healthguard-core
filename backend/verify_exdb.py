
import os

import requests

url = "https://exercisedb.p.rapidapi.com/exercises"
querystring = {"limit":"10"}
api_key = os.getenv("RAPIDAPI_KEY")

if not api_key:
    raise SystemExit("RAPIDAPI_KEY is required to verify ExerciseDB access.")

headers = {
	"x-rapidapi-key": api_key,
	"x-rapidapi-host": "exercisedb.p.rapidapi.com"
}

try:
    response = requests.get(url, headers=headers, params=querystring)
    print(f"Status: {response.status_code}")
    print(response.text[:200])
except Exception as e:
    print(e)
