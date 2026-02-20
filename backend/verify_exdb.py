
import requests

url = "https://exercisedb.p.rapidapi.com/exercises"
querystring = {"limit":"10"}

headers = {
	"x-rapidapi-key": "865a20209amshcc026b276b939a5p1f7177jsn597e7a6962bb",
	"x-rapidapi-host": "exercisedb.p.rapidapi.com"
}

try:
    response = requests.get(url, headers=headers, params=querystring)
    print(f"Status: {response.status_code}")
    print(response.text[:200])
except Exception as e:
    print(e)
