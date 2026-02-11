"""PDF report generation using Playwright (headless Chromium)."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


async def generate_pdf(html: str) -> bytes:
    """Render *html* to PDF via headless Chromium and return the raw bytes.

    The browser is launched, used once, and then closed so we don't leak
    resources.
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle")
            pdf_bytes = await page.pdf(
                format="A4",
                margin={
                    "top": "1cm",
                    "bottom": "1cm",
                    "left": "1.5cm",
                    "right": "1.5cm",
                },
                print_background=True,
            )
            return pdf_bytes
        finally:
            await browser.close()


def generate_pdf_sync(html: str) -> bytes:
    """Synchronous wrapper around :func:`generate_pdf`."""
    return asyncio.run(generate_pdf(html))
