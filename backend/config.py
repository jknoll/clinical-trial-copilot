from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openfda_api_key: str = ""
    aact_database_url: str = ""
    host: str = "0.0.0.0"
    port: int = 8100
    log_level: str = "info"
    sessions_dir: Path = Path("sessions")
    model: str = "claude-opus-4-6"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
