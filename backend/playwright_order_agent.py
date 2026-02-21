"""
HealthGuard Playwright Auto-Order Agent
Replaces the broken browser-use + vision LLM approach with deterministic
Playwright CSS/text selectors for each platform.

Supports: Amazon, Flipkart, 1mg, Netmeds
Browser stays open after add-to-cart so user can complete payment manually.
"""

import os
import time
import urllib.parse
import asyncio
from typing import Dict, Any, Callable, Optional, List
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

import re


def _sanitize_query(q: str) -> str:
    """Remove special characters that break e-commerce search URLs."""
    # Remove apostrophes, quotes, and other problematic chars
    cleaned = re.sub(r"['\"`~!@#$%^&*(){}\[\];:<>?/|\\]", ' ', q)
    # Collapse multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


# --- Platform Search URL Generators ---
PLATFORM_SEARCH_URLS = {
    'Amazon': lambda q: f'https://www.amazon.in/s?k={urllib.parse.quote(_sanitize_query(q))}',
    'Flipkart': lambda q: f'https://www.flipkart.com/search?q={urllib.parse.quote(_sanitize_query(q))}',
    '1mg': lambda q: f'https://www.1mg.com/search/all?name={urllib.parse.quote(_sanitize_query(q))}',
    'Netmeds': lambda q: f'https://www.netmeds.com/catalogsearch/result?q={urllib.parse.quote(_sanitize_query(q))}',
}


def get_direct_store_url(url: str, product_title: str, platform: str) -> str:
    """Get a direct store search URL instead of a Google Shopping redirect."""
    if 'google.com' in url or not url.startswith('http'):
        generator = PLATFORM_SEARCH_URLS.get(platform)
        if generator:
            return generator(product_title)
        return PLATFORM_SEARCH_URLS['1mg'](product_title)
    return url


# ============================================================
# Platform-Specific Add-to-Cart Flows
# Each function navigates: Search Results → Product → Add to Cart
# ============================================================

async def _dismiss_popups(page: Page):
    """Dismiss common popups (location, login, newsletter)."""
    popup_selectors = [
        'button:has-text("Not now")',
        'button:has-text("No thanks")',
        'button:has-text("Dismiss")',
        'button:has-text("Maybe later")',
        'button:has-text("Skip")',
        'button:has-text("Close")',
        '[aria-label="Close"]',
        '[aria-label="Dismiss"]',
        '.modal-close',
        '.popup-close',
        'button.close',
    ]
    for sel in popup_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=500):
                await elem.click()
                await page.wait_for_timeout(300)
        except:
            pass


async def flow_amazon(page: Page, product_title: str, emit: Callable) -> bool:
    """Amazon.in: Search → Click first result → Add to Cart."""
    emit("navigating", f"Searching Amazon for '{product_title}'...")

    url = PLATFORM_SEARCH_URLS['Amazon'](product_title)
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    await _dismiss_popups(page)

    # Click first search result
    emit("working", "Found search results. Clicking the first product...")
    result_selectors = [
        'div[data-component-type="s-search-result"] h2 a',
        '.s-result-item h2 a',
        '.a-link-normal.s-no-outline',
        'a.a-link-normal[href*="/dp/"]',
    ]

    clicked = False
    for sel in result_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                clicked = True
                break
        except:
            continue

    if not clicked:
        emit("error", "Could not find any product on Amazon search results.")
        return False

    await page.wait_for_timeout(3000)
    await _dismiss_popups(page)

    # Add to Cart
    emit("working", "On product page. Looking for Add to Cart button...")
    add_to_cart_selectors = [
        '#add-to-cart-button',
        'input[name="submit.add-to-cart"]',
        '#add-to-cart-button-ubb',
        'button:has-text("Add to Cart")',
        'input[value="Add to Cart"]',
    ]

    for sel in add_to_cart_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                emit("completed", "Added to cart on Amazon! Check the Chrome window.")
                return True
        except:
            continue

    # Try Buy Now as fallback
    try:
        buy_now = page.locator('#buy-now-button, input[name="submit.buy-now"]').first
        if await buy_now.is_visible(timeout=2000):
            await buy_now.click()
            emit("completed", "Clicked 'Buy Now' on Amazon! Check the Chrome window.")
            return True
    except:
        pass

    emit("error", "Could not find Add to Cart button on Amazon product page.")
    return False


async def flow_flipkart(page: Page, product_title: str, emit: Callable) -> bool:
    """Flipkart: Search → Click first result → Add to Cart."""
    emit("navigating", f"Searching Flipkart for '{product_title}'...")

    url = PLATFORM_SEARCH_URLS['Flipkart'](product_title)
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)

    # Dismiss login popup (Flipkart always shows this)
    try:
        close_btn = page.locator('button._2KpZ6l._2doB4z, button:has-text("✕"), button[class*="close"]').first
        if await close_btn.is_visible(timeout=3000):
            await close_btn.click()
            await page.wait_for_timeout(500)
    except:
        pass
    await _dismiss_popups(page)

    # Click first product
    emit("working", "Found search results. Clicking the first product...")
    result_selectors = [
        'a._1fQZEK',
        'a.s1Q9rs',
        'a._2rpwqI',
        'div._4rR01T',
        'a[href*="/p/"]',
        'div._2kHMtA a',
        'a._1fQZEK',
    ]

    clicked = False
    for sel in result_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                clicked = True
                break
        except:
            continue

    if not clicked:
        # Try generic text-based approach
        try:
            first_product = page.locator('[data-id] a').first
            if await first_product.is_visible(timeout=3000):
                await first_product.click()
                clicked = True
        except:
            pass

    if not clicked:
        emit("error", "Could not find any product on Flipkart search results.")
        return False

    await page.wait_for_timeout(3000)
    await _dismiss_popups(page)

    # Add to Cart
    emit("working", "On product page. Looking for Add to Cart button...")
    add_to_cart_selectors = [
        'button:has-text("Add to Cart")',
        'button:has-text("ADD TO CART")',
        'button._2KpZ6l._2U9uOA._3v1-ww',
        'button[class*="add-to-cart"]',
    ]

    for sel in add_to_cart_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                emit("completed", "Added to cart on Flipkart! Check the Chrome window.")
                return True
        except:
            continue

    # Try Buy Now as fallback
    try:
        buy_now = page.locator('button:has-text("Buy Now"), button:has-text("BUY NOW")').first
        if await buy_now.is_visible(timeout=2000):
            await buy_now.click()
            emit("completed", "Clicked 'Buy Now' on Flipkart! Check the Chrome window.")
            return True
    except:
        pass

    emit("error", "Could not find Add to Cart button on Flipkart.")
    return False


async def flow_1mg(page: Page, product_title: str, emit: Callable) -> bool:
    """1mg: Search → Click first result → Add to Cart."""
    emit("navigating", f"Searching 1mg for '{product_title}'...")

    url = PLATFORM_SEARCH_URLS['1mg'](product_title)
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    await _dismiss_popups(page)

    # Click first product
    emit("working", "Found search results. Clicking the first product...")
    result_selectors = [
        'a[href*="/otc/"]',
        'a[href*="/drugs/"]',
        '.style__product-card___1gbex a',
        '.style__horizontal-card___1Cwrt a',
        'div[class*="product-card"] a',
        'div[class*="style__card"] a',
    ]

    clicked = False
    for sel in result_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                clicked = True
                break
        except:
            continue

    if not clicked:
        # Fallback: click any link that looks like a product
        try:
            product_link = page.locator('a[class*="product"], a[class*="card"]').first
            if await product_link.is_visible(timeout=3000):
                await product_link.click()
                clicked = True
        except:
            pass

    if not clicked:
        emit("error", "Could not find any product on 1mg search results.")
        return False

    await page.wait_for_timeout(3000)
    await _dismiss_popups(page)

    # Add to Cart
    emit("working", "On product page. Looking for Add to Cart button...")
    add_to_cart_selectors = [
        'button:has-text("Add To Cart")',
        'button:has-text("ADD TO CART")',
        'button:has-text("Add to Cart")',
        'button[class*="AddToCartBtn"]',
        'button[class*="add-to-cart"]',
        'div[class*="AddToCart"] button',
    ]

    for sel in add_to_cart_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                emit("completed", "Added to cart on 1mg! Check the Chrome window.")
                return True
        except:
            continue

    emit("error", "Could not find Add to Cart button on 1mg product page.")
    return False


async def flow_netmeds(page: Page, product_title: str, emit: Callable) -> bool:
    """Netmeds: Go to homepage → Search via search bar → Click first result → Add to Cart.
    Netmeds catalogsearch URLs are broken, so we always use the search bar."""
    emit("navigating", f"Searching Netmeds for '{product_title}'...")

    # Extract just the medicine name (first 2-3 words) for broader search
    sanitized = _sanitize_query(product_title)
    # Use shorter query — long product titles often fail on Netmeds
    words = sanitized.split()
    short_query = ' '.join(words[:3]) if len(words) > 3 else sanitized

    # Go directly to homepage — catalogsearch URLs are unreliable
    await page.goto('https://www.netmeds.com', wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    await _dismiss_popups(page)

    # Type into Netmeds search bar
    emit("working", f"Using search bar to find '{short_query}'...")
    search_selectors = [
        'input[placeholder*="Search"]',
        'input[placeholder*="search"]',
        'input[placeholder*="medicines"]',
        'input#search',
        'input[name="search"]',
        'input[type="search"]',
        'input[type="text"]',
        '.search_input input',
    ]
    typed = False
    for sel in search_selectors:
        try:
            search_input = page.locator(sel).first
            if await search_input.is_visible(timeout=2000):
                await search_input.click()
                await page.wait_for_timeout(300)
                await search_input.fill(short_query)
                await page.wait_for_timeout(1000)
                await page.keyboard.press('Enter')
                typed = True
                break
        except:
            continue

    if not typed:
        emit("error", "Could not find the Netmeds search bar.")
        return False

    await page.wait_for_timeout(3000)
    await _dismiss_popups(page)

    # Click first product — handle new tabs carefully
    emit("working", "Found search results. Clicking the first product...")

    # IMPORTANT: Remove target="_blank" from ALL links so clicks stay in same tab
    await page.evaluate("""
        document.querySelectorAll('a[target="_blank"]').forEach(a => a.removeAttribute('target'));
        document.querySelectorAll('a[target]').forEach(a => a.removeAttribute('target'));
    """)

    result_selectors = [
        '.sku-card a',
        '.cat-item a',
        'a[href*="/non-prescriptions/"]',
        'a[href*="/prescriptions/"]',
        'a[href*="/otc/"]',
        '.product-name a',
        'div[class*="product"] a',
        'div[class*="catalogCard"] a',
        'div[class*="sku"] a',
    ]

    clicked = False
    for sel in result_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                # Try navigating via click
                async with page.expect_navigation(wait_until="domcontentloaded", timeout=10000):
                    await elem.click()
                clicked = True
                break
        except:
            # If expect_navigation times out, check if we're on a product page anyway
            current_url = page.url
            if '/non-prescriptions/' in current_url or '/prescriptions/' in current_url or '/otc/' in current_url:
                clicked = True
                break
            continue

    if not clicked:
        emit("error", "Could not find any product on Netmeds search results.")
        return False

    await page.wait_for_timeout(3000)
    await _dismiss_popups(page)

    # Check if we ended up back on homepage (redirect issue)
    current_url = page.url
    if current_url.rstrip('/') == 'https://www.netmeds.com' or '/catalogsearch/' in current_url:
        emit("working", "Redirect detected — trying to click the product differently...")
        await page.go_back()
        await page.wait_for_timeout(2000)
        # Try direct href extraction + navigation
        try:
            href = await page.locator('.sku-card a, a[href*="/non-prescriptions/"], a[href*="/otc/"]').first.get_attribute('href')
            if href:
                if not href.startswith('http'):
                    href = f"https://www.netmeds.com{href}"
                await page.goto(href, wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(2000)
                await _dismiss_popups(page)
        except:
            emit("error", "Could not navigate to the product page.")
            return False

    # Add to Cart — Netmeds uses different buttons on listing vs product pages:
    # Listing page: <div class="cart-button"> with "Add" text + SVG icon for "+"
    # Product page: <button class="primary-button-pdp"> with "Add to cart" text
    emit("working", "Looking for Add to Cart / Add+ button...")

    # First dismiss any marketing popups that might block clicks
    popup_close_selectors = [
        'button[class*="close"]',
        'div[class*="close"]',
        'span[class*="close"]',
        '[aria-label="Close"]',
        'button:has-text("×")',
        'button:has-text("✕")',
        '.modal-close',
        '.popup-close',
    ]
    for sel in popup_close_selectors:
        try:
            popup_btn = page.locator(sel).first
            if await popup_btn.is_visible(timeout=500):
                await popup_btn.click()
                await page.wait_for_timeout(500)
        except:
            pass

    add_to_cart_selectors = [
        # Netmeds listing page — the actual DOM structure
        '.cart-button',
        '.addToCartButton',
        'div.cart-button',
        'div.addToCartButton',
        # Netmeds product detail page
        'button.primary-button-pdp',
        '.cart-btn-container-desktop button',
        # Generic text-based fallbacks
        'button:has-text("Add to cart")',
        'button:has-text("Add To Cart")',
        'button:has-text("ADD TO CART")',
        'div:has-text("Add"):not(:has(div:has-text("Add")))',
        '.btn-add-cart',
        'button[class*="add-to-cart"]',
        'button[class*="addToCart"]',
        '.drug-atc-btn',
    ]

    for sel in add_to_cart_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=3000):
                await elem.click()
                emit("completed", "Added to cart on Netmeds! Check the Chrome window.")
                return True
        except:
            continue

    emit("error", "Could not find Add to Cart button on Netmeds product page.")
    return False


async def flow_generic(page: Page, url: str, product_title: str, emit: Callable) -> bool:
    """Generic fallback: Navigate to URL, try common Add to Cart patterns."""
    emit("navigating", f"Opening {url}...")
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(3000)
    await _dismiss_popups(page)

    emit("working", "Searching for Add to Cart button using common patterns...")
    generic_selectors = [
        'button:has-text("Add to Cart")',
        'button:has-text("ADD TO CART")',
        'button:has-text("Add To Cart")',
        'button:has-text("Buy Now")',
        'button:has-text("BUY NOW")',
        'input[value="Add to Cart"]',
        '#add-to-cart',
        '.add-to-cart',
        '[data-action="add-to-cart"]',
    ]

    for sel in generic_selectors:
        try:
            elem = page.locator(sel).first
            if await elem.is_visible(timeout=2000):
                await elem.click()
                emit("completed", "Added to cart! Check the Chrome window.")
                return True
        except:
            continue

    emit("error", "Could not find an Add to Cart button on this page.")
    return False


# ============================================================
# Main Agent Runner
# ============================================================

PLATFORM_FLOWS = {
    'Amazon': flow_amazon,
    'Flipkart': flow_flipkart,
    '1mg': flow_1mg,
    'Netmeds': flow_netmeds,
}


async def run_order_agent(
    url: str,
    product_title: str,
    platform: str = 'Other',
    on_progress: Optional[Callable[[str, str], None]] = None
) -> Dict[str, Any]:
    """
    Launch Playwright browser to navigate to a product URL and add it to cart.
    Browser stays open after completion so user can complete payment manually.
    """
    steps_log: List[Dict[str, Any]] = []

    def emit(step: str, detail: str = ""):
        if on_progress:
            on_progress(step, detail)
        steps_log.append({"step": step, "detail": detail, "time": time.time()})
        print(f"[Auto-Order] [{step}] {detail}")

    try:
        emit("initializing", "Launching Playwright Chrome browser...")

        direct_url = get_direct_store_url(url, product_title, platform)
        emit("launching", f"Opening Chrome → {platform}...")

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=False,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--start-maximized',
                ]
            )

            context = await browser.new_context(
                viewport={'width': 1366, 'height': 768},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='en-IN',
                timezone_id='Asia/Kolkata',
            )

            # Remove webdriver flag to reduce bot detection
            await context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            """)

            page = await context.new_page()

            # Select the right platform flow
            flow_fn = PLATFORM_FLOWS.get(platform)

            if flow_fn:
                success = await flow_fn(page, product_title, emit)
            else:
                success = await flow_generic(page, direct_url, product_title, emit)

            if success:
                emit("browser_open", "Chrome is open — finish your order there!")
            else:
                emit("browser_open", "Chrome is open — you may need to complete the process manually.")

            # Keep the browser alive for the user to complete payment
            # Wait until user manually closes the browser
            emit("waiting", "Waiting for you to finish in the browser...")
            try:
                await page.wait_for_event('close', timeout=300000)  # 5 min
            except:
                pass

            return {
                "success": success,
                "status": "completed" if success else "partial",
                "message": "Check the Chrome window to complete your order!",
                "steps": steps_log,
            }

    except Exception as e:
        error_msg = str(e)
        emit("error", error_msg)
        return {"success": False, "error": error_msg, "steps": steps_log}


def start_order_sync(url: str, product_title: str, platform: str = 'Other', progress_queue=None) -> Dict[str, Any]:
    """
    Synchronous wrapper — matches the exact same signature as the old browser_agent.py
    so server.py only needs a 1-line import change.
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
        try:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        except:
            pass
        loop.close()
