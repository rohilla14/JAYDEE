from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    DATABASE_URL: str
    JWT_SECRET: str
    # stub | gupshup | interakt (real providers raise NotImplemented until wired)
    WHATSAPP_PROVIDER: str = "stub"

settings = Settings()
