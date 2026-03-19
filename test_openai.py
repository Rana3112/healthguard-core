import requests
import json
import os

api_key = os.getenv("OPENAI_API_KEY", "")
invoke_url = "https://api.openai.com/v1/chat/completions"

if not api_key:
    raise RuntimeError("Set OPENAI_API_KEY before running this script.")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Accept": "text/event-stream",
    "Content-Type": "application/json",
}

payload = {
    "model": "o3-mini",
    "reasoning_effort": "high",
    "messages": [{"role": "user", "content": "Hello, test."}],
    "stream": True,
}

try:
    print("Sending request to OpenAI API...")
    response = requests.post(
        invoke_url, headers=headers, json=payload, stream=True, timeout=60
    )
    print(f"Status Code: {response.status_code}")

    if response.status_code != 200:
        print(f"Error Response: {response.text}")
    else:
        for chunk in response.iter_lines():
            if chunk:
                print(chunk.decode("utf-8"))
except Exception as e:
    print(f"Connection Exception: {e}")
