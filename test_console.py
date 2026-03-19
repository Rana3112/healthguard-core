from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Catch all console logs
    def handle_console(msg):
        print(f"BROWSER_LOG: {msg.type}: {msg.text}")
    
    page.on("console", handle_console)
    
    # Navigate to app
    page.goto("http://localhost:5173/app")
    
    # We might need to handle login, but wait, AuthContext hardcodes isPro = true and bypasses login? No, wait!
    # "isPro" was forced to true, but what about user? 
    # Let me check if the app requires login to view the chat surface.
    
    # Wait for the mode selector 
    try:
        page.wait_for_selector("button:has-text('Max Deep Think')", timeout=10000)
    except:
        print("Couldn't find Max Deep Think button. Maybe login is required?")
    
    browser.close()
