"""PDF report generation using Playwright (headless Chromium)."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


class PDFGenerationError(Exception):
    """Raised when PDF generation fails (e.g. browser not installed)."""


def check_playwright_browsers() -> bool:
    """Check whether Playwright Chromium browser is installed.

    Returns True if available, False otherwise.  Logs a warning when the
    browser cannot be found so operators know to run
    ``playwright install chromium``.

    This uses a filesystem-based check instead of the Playwright sync API
    so it works safely inside an asyncio event loop (e.g. FastAPI).
    """
    try:
        import pathlib
        import subprocess

        # Ask the playwright CLI for the browser path — this works inside
        # an async loop unlike sync_playwright().
        result = subprocess.run(
            ["python3", "-m", "playwright", "install", "--dry-run"],
            capture_output=True, text=True, timeout=10,
        )
        # Fallback: check the default Chromium install locations
        import sys
        if sys.platform == "darwin":
            cache_dir = pathlib.Path.home() / "Library" / "Caches" / "ms-playwright"
        else:
            cache_dir = pathlib.Path.home() / ".cache" / "ms-playwright"
        if cache_dir.exists():
            chrome_bins = list(cache_dir.glob("chromium-*/chrome-linux*/chrome")) + \
                          list(cache_dir.glob("chromium-*/chrome-mac-*/Google Chrome for Testing.app")) + \
                          list(cache_dir.glob("chromium-*/chrome-*/chrome")) + \
                          list(cache_dir.glob("chromium-*/chrome-*/chrome.exe"))
            if chrome_bins and any(b.exists() for b in chrome_bins):
                logger.info("Playwright Chromium browser is available for PDF generation.")
                return True

        logger.warning(
            "Playwright Chromium browser is NOT installed. "
            "PDF report generation will be unavailable. "
            "Run 'playwright install chromium' to fix this."
        )
        return False
    except Exception as exc:
        logger.warning(
            "Could not verify Playwright browser installation (%s: %s). "
            "PDF report generation may be unavailable. "
            "Run 'playwright install chromium' to fix this.",
            type(exc).__name__,
            exc,
        )
        return False


async def generate_pdf(html: str) -> bytes:
    """Render *html* to PDF via headless Chromium and return the raw bytes.

    The browser is launched, used once, and then closed so we don't leak
    resources.

    Raises :class:`PDFGenerationError` if the browser cannot be launched
    (e.g. Playwright browsers are not installed).
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise PDFGenerationError(
            "Playwright is not installed. "
            "Install it with 'pip install playwright' and then run "
            "'playwright install chromium'."
        ) from exc

    try:
        async with async_playwright() as pw:
            try:
                browser = await pw.chromium.launch(headless=True)
            except Exception as exc:
                raise PDFGenerationError(
                    "Failed to launch Chromium browser. "
                    "Ensure Playwright browsers are installed by running "
                    "'playwright install chromium'. "
                    f"Original error: {exc}"
                ) from exc

            try:
                page = await browser.new_page()
                await page.set_content(html, wait_until="networkidle")
                # Allow extra time for static map images to load
                await page.wait_for_timeout(3000)
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
    except PDFGenerationError:
        raise
    except Exception as exc:
        raise PDFGenerationError(
            f"Unexpected error during PDF generation: {exc}"
        ) from exc


def generate_pdf_sync(html: str) -> bytes:
    """Synchronous wrapper around :func:`generate_pdf`."""
    return asyncio.run(generate_pdf(html))
