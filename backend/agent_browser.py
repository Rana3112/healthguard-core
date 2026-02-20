"""
HealthGuard Medicine Search - Real price comparison via SerpAPI.
Searches Google Shopping for medicine prices across Indian e-commerce platforms.
"""

import os
import json
import requests
from typing import Dict, List, Any

SERP_API_KEY = os.environ.get('SERP_API_KEY', '')
SERP_API_URL = 'https://serpapi.com/search.json'

PLATFORM_DOMAINS = {
    'amazon.in': 'Amazon',
    'flipkart.com': 'Flipkart',
    '1mg.com': '1mg',
    'apollopharmacy.in': 'Apollo',
    'pharmeasy.in': 'PharmEasy',
    'netmeds.com': 'Netmeds',
}


def search_medicine(query: str) -> Dict[str, Any]:
    """
    Search for a medicine across Indian e-commerce platforms using SerpAPI Google Shopping.
    Returns structured results with prices, links, and platform info.
    """
    if not SERP_API_KEY:
        return {
            "success": False,
            "error": "SERP_API_KEY not configured. Add it to backend/.env or set as environment variable.",
            "results": []
        }

    try:
        params = {
            'engine': 'google_shopping',
            'q': f'{query} medicine india',
            'location': 'India',
            'hl': 'en',
            'gl': 'in',
            'api_key': SERP_API_KEY,
            'num': 20,
        }
        
        print(f"[DEBUG] agent_browser.py: Querying SERP API with: {query}")

        response = requests.get(SERP_API_URL, params=params, timeout=15)
        print(f"[DEBUG] agent_browser.py: Response Status: {response.status_code}")
        data = response.json()

        if 'error' in data:
            return {"success": False, "error": data['error'], "results": []}

        shopping_results = data.get('shopping_results', [])
        if not shopping_results:
            # Try inline shopping results
            shopping_results = data.get('inline_shopping_results', [])

        results = []
        seen_platforms = set()

        for item in shopping_results:
            source = item.get('source', '').lower()
            
            # Try multiple link fields (SerpAPI uses different ones)
            link = (
                item.get('product_link') or 
                item.get('link') or 
                item.get('second_hand_condition', {}).get('link') or
                ''
            )
            
            # Identify the platform
            platform = 'Other'
            for domain, name in PLATFORM_DOMAINS.items():
                if domain in source or domain in link:
                    platform = name
                    break

            # Generate fallback search URL if no direct link
            if not link:
                import urllib.parse
                encoded_q = urllib.parse.quote(item.get('title', query))
                FALLBACK_URLS = {
                    'Amazon': f'https://www.amazon.in/s?k={encoded_q}',
                    'Flipkart': f'https://www.flipkart.com/search?q={encoded_q}',
                    '1mg': f'https://www.1mg.com/search/all?name={encoded_q}',
                    'Apollo': f'https://www.apollopharmacy.in/search-medicines/{encoded_q}',
                    'PharmEasy': f'https://pharmeasy.in/search/all?name={encoded_q}',
                    'Netmeds': f'https://www.netmeds.com/catalogsearch/result?q={encoded_q}',
                    'Other': f'https://www.google.com/search?tbm=shop&q={encoded_q}',
                }
                link = FALLBACK_URLS.get(platform, FALLBACK_URLS['Other'])

            # Parse price
            price_str = item.get('price', item.get('extracted_price', ''))
            price_num = None
            if isinstance(price_str, (int, float)):
                price_num = float(price_str)
            elif isinstance(price_str, str):
                # Extract number from string like "₹150.00" or "Rs. 150"
                import re
                nums = re.findall(r'[\d,]+\.?\d*', price_str.replace(',', ''))
                if nums:
                    try:
                        price_num = float(nums[0])
                    except:
                        pass

            result = {
                'title': item.get('title', query),
                'price': price_num,
                'price_display': f"₹{price_num:.0f}" if price_num else price_str or 'N/A',
                'platform': platform,
                'source': item.get('source', 'Unknown'),
                'link': link,
                'image': item.get('thumbnail', ''),
                'rating': item.get('rating', None),
                'reviews': item.get('reviews', None),
                'delivery': item.get('delivery', ''),
            }
            results.append(result)

        # Sort by price (cheapest first), nulls last
        results.sort(key=lambda x: x['price'] if x['price'] is not None else float('inf'))

        # Group by platform and pick the cheapest from each
        platform_best = {}
        for r in results:
            p = r['platform']
            if p not in platform_best:
                platform_best[p] = r

        # Build final response: platform_best first, then remaining sorted by price
        best_picks = list(platform_best.values())
        best_picks.sort(key=lambda x: x['price'] if x['price'] is not None else float('inf'))

        return {
            "success": True,
            "query": query,
            "total_results": len(results),
            "best_picks": best_picks[:6],  # Top picks (one per platform, up to 6)
            "all_results": results[:12],     # All results (up to 12)
            "cheapest": best_picks[0] if best_picks else None,
        }

    except requests.exceptions.Timeout:
        return {"success": False, "error": "Search request timed out. Try again.", "results": []}
    except Exception as e:
        return {"success": False, "error": str(e), "results": []}
