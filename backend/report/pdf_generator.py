"""PDF report generation using Playwright (headless Chromium)."""

from __future__ import annotations

import asyncio
import logging
import shutil

logger = logging.getLogger(__name__)


class PDFGenerationError(Exception):
    """Raised when PDF generation fails (e.g. browser not installed)."""


def check_playwright_browsers() -> bool:
    """Check whether Playwright Chromium browser is installed.

    Returns True if available, False otherwise.  Logs a warning when the
    browser cannot be found so operators know to run
    ``playwright install chromium``.
    """
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            # chromium.executable_path is the quickest way to check without
            # actually launching a browser process.
            executable = pw.chromium.executable_path
            if not executable or not shutil.which(executable):
                # executable_path may return a path even if the binary is
                # missing; fall back to a filesystem check.
                import pathlib

                if not executable or not pathlib.Path(executable).exists():
                    logger.warning(
                        "Playwright Chromium browser is NOT installed. "
                        "PDF report generation will be unavailable. "
                        "Run 'playwright install chromium' to fix this."
                    )
                    return False
        logger.info("Playwright Chromium browser is available for PDF generation.")
        return True
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
