# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    def get_llm_client(self):
        """Return an LLM client suitable for llm_call."""
        pass

    @abstractmethod
    def get_embed_model_code(self):
        """Return a code embedding model for vector store."""
        pass

    @abstractmethod
    def get_embed_model_docs(self):
        """Return a docs embedding model for vector store."""
        pass

    @abstractmethod
    def get_query_engine_class(self):
        """Return a query engine LLM class (like LlamaOpenAI)."""
        pass

    @abstractmethod
    def get_query_model_kwargs(self):
        """Return any model/temperature/max_tokens params as dict."""
        pass

    @abstractmethod
    def call_llm(self, system_prompt: str, prompt: str, **kwargs):
        """Call the LLM and return a string answer."""
        pass
