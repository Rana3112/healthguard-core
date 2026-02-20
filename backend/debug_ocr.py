import torch
from transformers import AutoModelForCausalLM, AutoProcessor
import sys

print(f"Python version: {sys.version}")
print(f"Torch version: {torch.__version__}")

try:
    import transformers
    print(f"Transformers version: {transformers.__version__}")
    
    print("Attempting to load model configuration...")
    # Try loading just the config first to fail fast
    model = AutoModelForCausalLM.from_pretrained(
        "zai-org/glm-ocr", 
        trust_remote_code=True,
        device_map="auto", 
        torch_dtype=torch.float16
    )
    print("Model loaded successfully.")
except Exception as e:
    print("\nXXX ERROR LOADING MODEL XXX")
    print(e)
    print("XXX END ERROR XXX\n")
