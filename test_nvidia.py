import requests
import json

api_key = "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"
invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"

headers = {
  "Authorization": f"Bearer {api_key}",
  "Accept": "text/event-stream",
  "Content-Type": "application/json"
}

payload = {
  "model": "z-ai/glm5",
  "messages": [{"role":"user","content":"Hello, please respond quickly."}],
  "temperature": 1,
  "top_p": 1,
  "max_tokens": 1024,
  "chat_template_kwargs": {"enable_thinking": True, "clear_thinking": False},
  "stream": True
}

try:
    print("Sending request to Nvidia API...")
    response = requests.post(invoke_url, headers=headers, json=payload, stream=True, timeout=60)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Error Response: {response.text}")
    else:
        for chunk in response.iter_lines():
            if chunk:
                print(chunk.decode("utf-8"))
except Exception as e:
    print(f"Connection Exception: {e}")
