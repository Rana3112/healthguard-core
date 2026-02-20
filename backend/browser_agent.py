"""
HealthGuard Auto-Order Agent — Uses browser-use to automate medicine ordering.
Opens a real Chrome browser, navigates to the product, adds to cart, and stops at checkout.
The browser stays open so the user can complete payment manually.
"""

import os
import asyncio
import json
import time
import urllib.parse
from typing import Dict, Any, Callable, Optional

from dotenv import load_dotenv
load_dotenv()

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')

# Platform-specific URL generators — these create ACTUAL store search URLs
PLATFORM_SEARCH_URLS = {
    'Amazon': lambda q: f'https://www.amazon.in/s?k={urllib.parse.quote(q)}',
    'Flipkart': lambda q: f'https://www.flipkart.com/search?q={urllib.parse.quote(q)}',
    '1mg': lambda q: f'https://www.1mg.com/search/all?name={urllib.parse.quote(q)}',
    'Apollo': lambda q: f'https://www.apollopharmacy.in/search-medicines/{urllib.parse.quote(q)}',
    'PharmEasy': lambda q: f'https://pharmeasy.in/search/all?name={urllib.parse.quote(q)}',
    'Netmeds': lambda q: f'https://www.netmeds.com/catalogsearch/result?q={urllib.parse.quote(q)}',
}


def get_direct_store_url(url: str, product_title: str, platform: str) -> str:
    """
    Get a direct store URL instead of a Google Shopping redirect.
    Google Shopping URLs are stale and show 'item no longer available'.
    """
    # If the URL is a Google redirect/shopping URL, replace with direct store search
    if 'google.com' in url or not url.startswith('http'):
        generator = PLATFORM_SEARCH_URLS.get(platform)
        if generator:
            return generator(product_title)
        # Default: search on 1mg (reliable Indian pharmacy site)
        return PLATFORM_SEARCH_URLS['1mg'](product_title)
    return url


async def run_order_agent(
    url: str,
    product_title: str,
    platform: str = 'Other',
    on_progress: Optional[Callable[[str, str], None]] = None
) -> Dict[str, Any]:
    """
    Launch browser-use agent to navigate to a product URL and add it to cart.
    Browser stays open after completion so user can complete payment.
    """
    if not OPENROUTER_API_KEY and not GEMINI_API_KEY:
        return {
            "success": False,
            "error": "No API key set. Add OPENROUTER_API_KEY or GEMINI_API_KEY to backend/.env",
            "steps": []
        }

    def emit(step: str, detail: str = ""):
        if on_progress:
            on_progress(step, detail)

    steps_log = []

    try:
        emit("initializing", "Loading AI browser agent...")
        
        from browser_use import Agent, Browser

        # Use OpenRouter (free models available) → fallback to Gemini
        if OPENROUTER_API_KEY:
            from browser_use.llm.openrouter.chat import ChatOpenRouter
            llm = ChatOpenRouter(
                model="nvidia/nemotron-nano-12b-v2-vl:free",
                api_key=OPENROUTER_API_KEY,
                temperature=0.0,
            )
            llm_name = "OpenRouter (NVIDIA Nemotron VL Free)"
        else:
            from browser_use.llm.google.chat import ChatGoogle
            llm = ChatGoogle(
                model="gemini-2.0-flash",
                api_key=GEMINI_API_KEY,
                temperature=0.0,
            )
            llm_name = "Google Gemini"

        # Get a direct store URL (not Google Shopping redirect)
        direct_url = get_direct_store_url(url, product_title, platform)
        
        emit("launching", f"Opening Chrome → {platform} (AI: {llm_name})...")
        steps_log.append({"step": "launching", "detail": f"Chrome → {platform} via {llm_name}", "time": time.time()})

        browser = Browser(
            headless=False,
            disable_security=True,
        )

        task = f"""
You are a shopping assistant helping a user buy medicine from an Indian e-commerce website.

STEP 1: Go to this URL: {direct_url}
STEP 2: You are on a search results page. Look for the product that BEST matches "{product_title}".
STEP 3: Click on the product to go to its detail page.
STEP 4: On the product detail page, click "Add to Cart" or "Buy Now" or any equivalent purchase button.
STEP 5: If a cart page opens, click "Proceed to Checkout" or "Place Order" to go to the checkout page.
STEP 6: STOP HERE — do NOT enter payment details.

IMPORTANT RULES:
- Do NOT enter any payment information (card, UPI, etc.)
- Do NOT click final "Pay" or "Complete Payment" buttons
- If you need to log in, STOP and report "Login required"
- If you see a CAPTCHA, STOP and report "CAPTCHA detected"  
- If a popup appears (location, cookies, newsletter), dismiss it
- Click on the FIRST relevant search result if multiple appear
"""

        emit("navigating", f"Searching for {product_title}...")
        steps_log.append({"step": "navigating", "detail": direct_url, "time": time.time()})

        agent = Agent(
            task=task,
            llm=llm,
            browser=browser,
            max_actions_per_step=4,
        )

        emit("working", "AI agent is navigating the website...")

        history = await agent.run(max_steps=20)

        # Extract results (API may vary by version)
        try:
            final_result = history.final_result() if hasattr(history, 'final_result') else str(history)
        except:
            final_result = "Agent completed — check the browser window!"
        
        try:
            is_done = history.is_done() if hasattr(history, 'is_done') else True
        except:
            is_done = True

        if is_done:
            emit("completed", "Look at the Chrome window — your medicine is in the cart!")
        else:
            emit("completed", final_result or "Agent stopped — check the Chrome window")
        
        steps_log.append({"step": "completed", "detail": final_result or "Check Chrome for cart", "time": time.time()})

        # Extract action history for progress display (API varies by version)
        try:
            action_results = history.action_results() if hasattr(history, 'action_results') else []
            for i, action_result in enumerate(action_results):
                extracted = getattr(action_result, 'extracted_content', None)
                if extracted:
                    steps_log.append({
                        "step": f"action_{i+1}",
                        "detail": str(extracted),
                        "time": time.time()
                    })
        except Exception:
            pass

        # NOTE: Browser is intentionally NOT closed here.
        # User completes payment manually in the open Chrome window.
        emit("browser_open", "Chrome is open — finish your order there!")

        return {
            "success": is_done,
            "status": "completed" if is_done else "stopped",
            "message": "Cart is in the open Chrome window — complete payment there!",
            "steps": steps_log,
        }

    except ImportError as e:
        emit("error", f"Missing dependency: {e}")
        return {"success": False, "error": f"Missing dependency: {e}. Run: pip install browser-use", "steps": steps_log}

    except Exception as e:
        error_msg = str(e)
        emit("error", error_msg)
        steps_log.append({"step": "error", "detail": error_msg, "time": time.time()})
        return {"success": False, "error": error_msg, "steps": steps_log}


def start_order_sync(url: str, product_title: str, platform: str = 'Other', progress_queue=None) -> Dict[str, Any]:
    """
    Synchronous wrapper to run the async order agent.
    Uses a progress_queue (list) for thread-safe progress updates.
    """
    def on_progress(step, detail):
        if progress_queue is not None:
            progress_queue.append({"step": step, "detail": detail, "time": time.time()})

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(run_order_agent(url, product_title, platform, on_progress))
        return result
    finally:
        # Clean up pending tasks to avoid "Task was destroyed" warnings
        try:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        except Exception:
            pass
        loop.close()
