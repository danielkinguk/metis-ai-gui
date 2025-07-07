# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

from abc import ABC, abstractmethod


class BaseVectorStore(ABC):
    @abstractmethod
    def init(self):
        """Initialize vector storage components (e.g., vector store and storage context)."""
        pass

    @abstractmethod
    def get_query_engines(
        self, llm_provider, similarity_top_k: int, response_mode: str
    ):
        """Return tuple of query engines for code and docs."""
        pass

    @abstractmethod
    def get_storage_contexts(self):
        """Return tuple of storage contexts (code, docs) for indexing."""
        pass
