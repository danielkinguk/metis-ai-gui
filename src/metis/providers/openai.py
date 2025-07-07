# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI as LlamaOpenAI
from openai import OpenAI

from metis.providers.base import LLMProvider

import logging

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    def __init__(self, config):
        self.api_key = config["llm_api_key"]
        self.code_embedding_model = config["code_embedding_model"]
        self.docs_embedding_model = config["docs_embedding_model"]
        self.query_model = config["llama_query_model"]
        self.temperature = config.get("llama_query_temperature", 0.0)
        self.max_tokens = config.get("llama_query_max_tokens", 512)

    def get_llm_client(self):
        return OpenAI(api_key=self.api_key)

    def get_embed_model_code(self):
        return OpenAIEmbedding(model_name=self.code_embedding_model)

    def get_embed_model_docs(self):
        return OpenAIEmbedding(model_name=self.docs_embedding_model)

    def get_query_engine_class(self):
        return LlamaOpenAI

    def get_query_model_kwargs(self):
        return {
            "model": self.query_model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

    def call_llm(self, system_prompt: str, prompt: str, model=None, **kwargs):
        model = model or self.query_model
        client = self.get_llm_client()
        try:
            if model == "gpt-4o":
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=self.temperature,
                )
            else:
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": system_prompt + prompt}],
                )
            answer = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            answer = ""
        return answer
