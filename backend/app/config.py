from pydantic import Field
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Polyglot Writing Coach API"
    app_env: str = "dev"

    languagetool_url: str = Field(default="https://api.languagetool.org/v2/check")
    require_languagetool: bool = True
    libretranslate_url: str = Field(default="https://translate.argosopentech.com/translate")
    dictionary_api_base: str = Field(default="https://api.dictionaryapi.dev/api/v2/entries/en")

    max_text_length: int = 50000
    max_file_size_bytes: int = 8 * 1024 * 1024
    request_timeout_seconds: float = 8.0

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PWC_")


settings = Settings()
