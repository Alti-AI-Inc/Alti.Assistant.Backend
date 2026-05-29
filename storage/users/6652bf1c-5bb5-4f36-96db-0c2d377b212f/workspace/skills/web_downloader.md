---
name: web_downloader
description: Securely scrapes text, descriptions, and hyperlinks from a specified webpage URL inside the container network.
parameters:
  url:
    type: string
    description: "The webpage URL to download and clean (e.g. https://example.com)"
    required: true
script: web_downloader.py
---
