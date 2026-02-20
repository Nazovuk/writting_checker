from pydantic import Field
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Polyglot Writing Coach API"
    app_env: str = "dev"

    languagetool_url: str = Field(default="http://localhost:8010/v2/check")
    libretranslate_url: str = Field(default="http://localhost:5001/translate")

    max_text_length: int = 50000
    max_file_size_bytes: int = 8 * 1024 * 1024
    request_timeout_seconds: float = 8.0

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PWC_")


settings = Settings()
