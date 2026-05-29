import sys
import urllib.request
import re

def main():
    url = ""
    for i, arg in enumerate(sys.argv):
        if arg == "--url" and i + 1 < len(sys.argv):
            url = sys.argv[i + 1]

    if not url:
        print("Error: No URL provided.")
        sys.exit(1)

    print(f"### Web Downloader Scraping: `{url}`\n")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8')
            
        html = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', '', html, flags=re.I)
        html = re.sub(r'<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>', '', html, flags=re.I)
        
        text = re.sub(r'<[^>]+>', ' ', html)
        lines = [line.strip() for line in text.splitlines()]
        chunks = [phrase.strip() for line in lines for phrase in line.split("  ")]
        clean_text = "\n".join(chunk for chunk in chunks if chunk)
        
        excerpt = clean_text[:2000]
        print(f"**Document Excerpt**:\n\n{excerpt}")
        if len(clean_text) > 2000:
            print("\n*... [Output Truncated due to size constraints]*")
    except Exception as e:
        print(f"Error downloading webpage: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
